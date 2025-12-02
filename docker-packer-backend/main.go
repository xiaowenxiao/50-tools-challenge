package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/gin-gonic/gin"
)

// --- 配置部分 ---
var (
	// 建议：开发环境用相对路径，生产环境通过环境变量覆盖
	OutputDir = getEnv("APP_OUTPUT_DIR", "/data/docker-images")
)

const (
	FileRetention   = 1 * time.Hour
	CleanupInterval = 30 * time.Minute
)

// --- 协议定义 (Contract) ---
type SSEMessage struct {
	Timestamp int64       `json:"ts"`                // Unix 时间戳
	Level     string      `json:"level"`             // info, error, success, raw
	Stage     string      `json:"stage"`             // pull, pack, done
	Content   string      `json:"msg"`               // 主要文本内容
	Payload   interface{} `json:"payload,omitempty"` // 额外数据
}

var imageRegex = regexp.MustCompile(`^[a-zA-Z0-9.\-_:/]+$`)

func main() {
	// 1. 初始化目录
	if err := os.MkdirAll(OutputDir, 0755); err != nil {
		log.Fatal("❌ 无法创建输出目录 (权限不足?):", err)
	}
	fmt.Printf("📂 存储路径: %s\n", OutputDir)

	// 2. 初始化 Docker Client
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal("❌ Docker 连接失败:", err)
	}
	defer cli.Close()

	// 3. 启动清理任务
	go startCleanupTask()

	// 4. Gin 设置
	r := gin.Default()

	// CORS 设置
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Next()
	})

	r.StaticFS("/download", gin.Dir(OutputDir, true))

	r.GET("/api/pack", func(c *gin.Context) {
		handlePack(c, cli)
	})

	port := getEnv("PORT", "8082")
	fmt.Printf("🚀 服务启动在 :%s\n", port)
	r.Run(":" + port)
}

// --- 核心业务逻辑 ---

func handlePack(c *gin.Context, cli *client.Client) {
	rawImageName := c.Query("image")

	// SSE Headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	// 1. 基础正则校验
	if rawImageName == "" || !imageRegex.MatchString(rawImageName) {
		sendJSON(c, "error", "init", "镜像名称包含非法字符", nil)
		return
	}

	// 2. 自动补全 Tag 逻辑 (修复打包过大的 Bug)
	// 如果用户只传了 "nginx"，我们需要把它变成 "nginx:latest"
	// 否则 docker save nginx 会导出本地所有版本的 nginx 镜像
	imageName := rawImageName
	if !strings.Contains(rawImageName, ":") {
		imageName = rawImageName + ":latest"
		// 稍微提示一下前端
		sendJSON(c, "info", "init", fmt.Sprintf("检测到未指定 Tag，自动补全为: %s", imageName), nil)
	}

	ctx := context.Background()

	// ===========================
	// STAGE 1: PULL
	// ===========================
	sendJSON(c, "info", "pull", fmt.Sprintf("正在连接 Docker Hub 拉取: %s", imageName), nil)

	pullReader, err := cli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		sendJSON(c, "error", "pull", fmt.Sprintf("拉取失败: %v", err), nil)
		return
	}

	// 实时转发 Docker 进度日志
	forwardDockerStream(c, pullReader, "pull")
	pullReader.Close()

	sendJSON(c, "success", "pull", "镜像拉取完成", nil)

	// ===========================
	// STAGE 2: PACK (流式压缩，但在名字上撒谎)
	// ===========================
	sendJSON(c, "info", "pack", "正在流式构建压缩包...", nil)

	safeName := regexp.MustCompile(`[^a-zA-Z0-9]`).ReplaceAllString(imageName, "_")

	// 文件名后缀强制使用 .tar，实际上是 gzip 压缩流
	fileName := fmt.Sprintf("%s_%d.tar", safeName, time.Now().Unix())
	filePath := filepath.Join(OutputDir, fileName)

	outFile, err := os.Create(filePath)
	if err != nil {
		sendJSON(c, "error", "pack", "服务器磁盘写入失败", nil)
		return
	}
	defer outFile.Close()

	// 依然使用 Gzip Writer！保持文件体积最小化
	gw := gzip.NewWriter(outFile)
	defer gw.Close()

	// 这里的 imageName 已经是带 tag 的了 (例如 nginx:latest)
	// 所以 Docker 只会导出这一个镜像
	imageReadCloser, err := cli.ImageSave(ctx, []string{imageName})
	if err != nil {
		sendJSON(c, "error", "pack", fmt.Sprintf("Docker 导出失败: %v", err), nil)
		return
	}
	defer imageReadCloser.Close()

	// 🚀 极速流式拷贝: Docker Stream -> Gzip -> File(.tar)
	if _, err := io.Copy(gw, imageReadCloser); err != nil {
		sendJSON(c, "error", "pack", "压缩过程发生 IO 错误", nil)
		return
	}

	gw.Close()
	outFile.Sync()

	// ===========================
	// STAGE 3: DONE
	// ===========================
	fileInfo, _ := os.Stat(filePath)
	sizeMB := float64(fileInfo.Size()) / 1024 / 1024
	downloadPath := fmt.Sprintf("/download/%s", fileName)

	cmdLoad := fmt.Sprintf("docker load -i %s", fileName)

	sendJSON(c, "done", "finish", fmt.Sprintf("打包成功! 大小: %.2f MB", sizeMB), map[string]string{
		"url":      downloadPath,
		"size":     fmt.Sprintf("%.2f MB", sizeMB),
		"filename": fileName,
		"cmd_load": cmdLoad,
		"tips":     "💡 该文件已深度压缩，无需解压，直接运行上述命令即可导入。",
	})
}

// --- 辅助函数 ---

func sendJSON(c *gin.Context, level, stage, msg string, payload interface{}) {
	data := SSEMessage{
		Timestamp: time.Now().Unix(),
		Level:     level,
		Stage:     stage,
		Content:   msg,
		Payload:   payload,
	}
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
	c.Writer.Flush()
}

func forwardDockerStream(c *gin.Context, reader io.Reader, stage string) {
	buf := make([]byte, 1024)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			sendJSON(c, "raw", stage, string(buf[:n]), nil)
		}
		if err != nil {
			break
		}
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func startCleanupTask() {
	ticker := time.NewTicker(CleanupInterval)
	for range ticker.C {
		files, err := os.ReadDir(OutputDir)
		if err != nil {
			continue
		}
		now := time.Now()
		for _, file := range files {
			info, err := file.Info()
			if err != nil {
				continue
			}
			if now.Sub(info.ModTime()) > FileRetention {
				os.Remove(filepath.Join(OutputDir, file.Name()))
				fmt.Printf("🗑️ [自动清理] 已删除: %s\n", file.Name())
			}
		}
	}
}
