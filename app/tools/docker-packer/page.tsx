"use client";

import React, { useEffect, useRef, useState } from "react";
// 移除 Next.js 特定依赖，改用标准 HTML 标签以增强兼容性
// import Link from "next/link"; 
import {
  Box,
  Check,
  AlertCircle,
  Download,
  Package,
  Loader2,
  Cpu,
  Zap,
  Archive,
  Copy,
  ArrowLeft,
  Command,
} from "lucide-react";

// 如果没有配置环境变量，默认指向你的内网后端
const API_BASE_URL = process.env.NEXT_PUBLIC_DOCKER_PACKER_API_BASE || "http://192.168.123.100:8082";

export default function DockerPacker() {
  const [imageName, setImageName] = useState("");
  const [isPacking, setIsPacking] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  // 简单的页面访问保护（session 级别）
  // NOTE: avoid reading sessionStorage during SSR to prevent hydration mismatch.
  // We'll determine auth status after mount.
  const [authed, setAuthed] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const submitPassword = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/packer-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.ok) {
          try { sessionStorage.setItem('docker_packer_authed', '1'); } catch(e) {}
          setAuthed(true);
          setPasswordInput('');
          setAuthError(null);
        } else {
          setAuthError('密码错误');
        }
      } else if (res.status === 401) {
        setAuthError('密码错误');
      } else {
        const j = await res.json().catch(() => ({}));
        setAuthError(j?.error || '认证失败');
      }
    } catch (e) {
      setAuthError('无法连接到认证接口');
    } finally {
      setAuthLoading(false);
    }
  };

  // On client mount, read sessionStorage to set auth state and mark mounted.
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('docker_packer_authed') === '1';
      setAuthed(Boolean(v));
    } catch (e) {
      setAuthed(false);
    }
    setMounted(true);
  }, []);

  // 自动滚动日志
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // --- 修复 1: 更强健的复制函数 (HTTP 环境兼容) ---
  const handleCopy = async (text: string) => {
    try {
      // 优先尝试标准 API (仅 HTTPS 或 localhost 可用)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // HTTP 环境回退方案: 使用 opacity:0 覆盖在可视区域，防止被浏览器判定为不可见元素而禁止操作
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // 关键样式：防止页面跳动，同时保证元素"可见"但透明
        textArea.style.position = "fixed";
        textArea.style.left = "0";
        textArea.style.top = "0";
        textArea.style.width = "1px";
        textArea.style.height = "1px";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        textArea.style.opacity = "0.01"; // 极低透明度，防止被完全隐藏优化掉
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand("copy");
          if (!successful) throw new Error("Copy command failed");
        } catch (err) {
          console.error("Fallback copy failed", err);
          alert("浏览器安全限制：请手动选中命令进行复制");
          return;
        } finally {
          document.body.removeChild(textArea);
        }
      }
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
      alert("复制失败");
    }
  };

  // --- 修复 2: 单行日志解析逻辑 (用于拆分多行消息) ---
  const parseDockerLogLine = (line: string): string => {
    const trimLine = line.trim();
    if (!trimLine) return "";
    
    // 如果不是 JSON，原样返回
    if (!trimLine.startsWith("{")) return trimLine;

    try {
      // 使用正则提取，比 JSON.parse 更能容错（防止断行导致的 JSON 错误）
      const idMatch = trimLine.match(/"id":"([^"]*)"/);
      const statusMatch = trimLine.match(/"status":"([^"]*)"/);
      const progressMatch = trimLine.match(/"progress":"([^"]*)"/);
      
      if (statusMatch || progressMatch) {
        const id = idMatch ? idMatch[1] : "";
        const status = statusMatch ? statusMatch[1] : "";
        let progress = progressMatch ? progressMatch[1] : "";
        
        // 修复 unicode 箭头显示
        progress = progress.replace(/\\u003e/g, ">");
        
        // 格式化对齐
        let text = "";
        if (id) text += `${id.padEnd(12)} `; // ID 固定宽度
        if (status) text += `${status} `;
        if (progress) text += `${progress}`;
        return text;
      }
      return trimLine;
    } catch (e) {
      return trimLine;
    }
  };

  const handlePack = () => {
    if (!imageName.trim()) return;
    setIsPacking(true);
    setLogs([]);
    setResult(null);
    setError(null);

    const url = `${API_BASE_URL}/api/pack?image=${encodeURIComponent(imageName)}`;
    const evtSource = new EventSource(url);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const timestamp = Date.now() / 1000;
        
        // 处理普通日志 (非 Raw)
        if (data.level !== "done" && data.level !== "raw") {
          setLogs((prev) => [...prev, data]);
        }
        
        // --- 修复 3: 拆解 Raw 日志，确保每一行都有时间戳 ---
        if (data.level === "raw" && data.msg) {
          // 将可能包含多行的 msg 拆分成数组
          const lines = data.msg.split('\n').filter((l: string) => l.trim().length > 0);
          
          const newLogs = lines.map((line: string) => ({
            ts: timestamp,
            level: 'raw',
            msg: parseDockerLogLine(line) // 立即格式化
          })).filter((l: any) => l.msg); // 过滤掉解析后为空的行

          if (newLogs.length > 0) {
            setLogs((prev) => [...prev, ...newLogs]);
          }
        }
        
        // 处理完成状态
        if (data.level === "done") {
          setLogs((prev) => [...prev, {
            ts: timestamp,
            level: 'success',
            msg: '压缩打包完成，请点击上方按钮下载'
          }]);
          
          setResult(data.payload);
          setIsPacking(false);
          evtSource.close();
        }
        
        if (data.level === "error") {
          setError(data.msg || "未知错误");
          setIsPacking(false);
          evtSource.close();
        }
      } catch (e) {
        console.error("解析日志失败", e);
      }
    };

    evtSource.onerror = (err) => {
      console.error("SSE Error:", err);
      if (!result) {
        setError("连接中断，请检查后端服务是否启动");
        setIsPacking(false);
      }
      evtSource.close();
    };
  };

  return (
    <div className="docker-packer-light min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans text-slate-900">
      {/* Password gate overlay (sessionStorage-based) */}
      {!authed && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h2 className="text-lg font-semibold mb-2">请输入访问密码</h2>
            <p className="text-sm text-slate-500 mb-4">为防止被滥用，需输入服务器上配置的密码才能访问本页面。</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
              className="w-full border rounded px-3 py-2 mb-3"
              placeholder="输入密码并回车"
            />
            {authError && <div className="text-red-600 text-sm mb-2">{authError}</div>}
            <div className="flex items-center justify-between">
              <button onClick={submitPassword} disabled={authLoading || !passwordInput} className="bg-cyan-600 text-white px-4 py-2 rounded">
                {authLoading ? '校验中...' : '提交'}
              </button>
              <button onClick={() => { setPasswordInput(''); setAuthError(null); }} className="text-sm text-slate-500">清除</button>
            </div>
            <div className="mt-4 text-xs text-slate-400">若尚未配置密码，请在服务器环境变量 <code>DOCKER_PACKER_PASSWORD</code> 中设置一个值。</div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="text-center space-y-6">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 mb-2">
            <div className="bg-cyan-50 p-3 rounded-xl">
              <Box size={32} className="text-cyan-600" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
              Docker 离线镜像打包器
            </h1>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              输入镜像名，自动拉取并转换为 <span className="font-mono text-sm bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">.tar</span> 离线包，专为内网环境设计。
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <FeatureBadge icon={<Cpu size={14} />} text="流式压缩处理" />
            <FeatureBadge icon={<Archive size={14} />} text="体积最小化" />
            <FeatureBadge icon={<Zap size={14} />} text="并行下载加速" />
          </div>
        </header>

        {/* Main Card */}
        <main className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          
          {/* Input Area */}
          <div className="p-1 bg-slate-50/50 m-2 rounded-xl border border-slate-100">
            <div className="flex flex-col md:flex-row gap-2 bg-white rounded-lg p-2 shadow-sm">
              <div className="flex-1 relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors">
                  <Command size={18} />
                </div>
                <input
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isPacking && handlePack()}
                  disabled={isPacking}
                  placeholder="请输入镜像名 (例如: nginx:latest)"
                  className="w-full pl-11 pr-4 py-3 bg-transparent border-none outline-none text-lg font-mono placeholder:font-sans placeholder:text-slate-400 text-slate-700"
                />
              </div>
              <button
                onClick={handlePack}
                disabled={isPacking || !imageName}
                className={`
                  px-8 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2
                  ${isPacking 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-slate-900 text-white hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/20 active:scale-95'}
                `}
              >
                {isPacking ? <Loader2 className="animate-spin" size={18} /> : <Package size={18} />}
                {isPacking ? '打包中...' : '开始打包'}
              </button>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            
            {/* Success Result */}
            {result && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Check size={120} className="text-emerald-500" />
                  </div>
                  
                  <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
                        <div className="p-1 bg-emerald-100 rounded-full"><Check size={16} /></div>
                        打包完成
                      </div>
                      <div className="text-sm text-emerald-800/80 space-y-1">
                        <p>文件名称：<span className="font-mono font-medium">{result.filename}</span></p>
                        <p>文件大小：<span className="font-mono font-medium">{result.size}</span></p>
                      </div>
                    </div>
                    
                    <a 
                      href={`${API_BASE_URL}${result.url}`} 
                      target="_blank"
                      className="group flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30"
                    >
                      <Download size={18} className="group-hover:-translate-y-0.5 transition-transform" /> 
                      下载文件
                    </a>
                  </div>

                  {/* Copy Command Area */}
                  <div className="mt-5 bg-white border border-emerald-100/50 rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-emerald-600/80 uppercase tracking-wider">Load Command</span>
                      <button 
                        onClick={() => handleCopy(result.cmd_load)} 
                        className="text-xs flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 rounded text-slate-500 transition-colors"
                      >
                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        {copied ? '已复制' : '复制命令'}
                      </button>
                    </div>
                    <code className="block font-mono text-sm text-slate-600 break-all bg-slate-50 p-2 rounded border border-slate-100">
                      {result.cmd_load}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 flex items-start gap-3 animate-in shake">
                <AlertCircle className="shrink-0 mt-0.5" size={20} />
                <div className="text-sm font-medium">{error}</div>
              </div>
            )}

            {/* Terminal Logs */}
            {(logs.length > 0 || isPacking) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse"></div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Build Process</span>
                </div>
                
                {/* --- 修复 4: 终端样式重构 --- */}
                {/* 使用 Flex 布局确保时间戳和内容严格对齐 */}
                {/* 内容区域 overflow-x-auto + whitespace-pre 确保进度条不折行 */}
                <div className="bg-[#1e1e1e] rounded-xl border border-slate-800 p-4 shadow-inner font-mono text-xs leading-relaxed">
                  <div className="h-64 overflow-y-auto terminal-scroll pr-2"> 
                    {logs.map((log, index) => (
                      <div key={index} className="flex items-start gap-3 mb-1 hover:bg-white/5 rounded px-1 -mx-1 transition-colors"> 
                        {/* Timestamp Column: 固定宽度，不缩放 */}
                        <span className="text-zinc-600 select-none shrink-0 w-[60px] text-right">
                          {new Date(log.ts * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                        </span>
                        
                        {/* Content Column */}
                        <div className="flex-1 min-w-0 overflow-x-auto whitespace-pre terminal-scroll">
                            {log.level === 'raw' ? (
                              <span className="text-zinc-500 text-[11px] font-light">{log.msg}</span>
                            ) : log.level === 'info' ? (
                              <span className="text-blue-400 font-semibold">
                                <span className="text-blue-500 mr-2">➜</span>
                                {log.msg}
                              </span>
                            ) : log.level === 'success' ? (
                              <span className="text-emerald-400 font-semibold">
                                <span className="text-emerald-500 mr-2">✔</span>
                                {log.msg}
                              </span>
                            ) : log.level === 'error' ? (
                              <span className="text-red-400 font-semibold">
                                <span className="text-red-500 mr-2">✘</span>
                                {log.msg}
                              </span>
                            ) : (
                              <span className="text-zinc-300">{log.msg}</span>
                            )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Blinking Cursor */}
                    {isPacking && !result && !error && (
                      <div className="flex items-center gap-3 px-1 mt-1">
                        <span className="w-[60px] shrink-0"></span>
                        <div className="h-3 w-1.5 bg-slate-500 animate-pulse"></div>
                      </div>
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <div className="text-center">
          <a 
            href="/" 
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft size={14} />
            返回工具列表
          </a>
        </div>
      </div>

      <style jsx global>{`
        /* 终端滚动条美化 */
        .terminal-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px; /* 横向滚动条高度 */
        }
        .terminal-scroll::-webkit-scrollbar-track {
          background: transparent; 
        }
        .terminal-scroll::-webkit-scrollbar-thumb {
          background: #333; 
          border-radius: 3px;
        }
        .terminal-scroll::-webkit-scrollbar-thumb:hover {
          background: #555; 
        }
        .terminal-scroll::-webkit-scrollbar-corner {
          background: transparent;
        }
        /* 强制浅色：在系统深色模式下覆盖常见深色背景与浅色文本 */
        @media (prefers-color-scheme: dark) {
          .docker-packer-light { background-color: #F3F4F6 !important; color: #0f172a !important; color-scheme: light !important; }
          .docker-packer-light .bg-[#1e1e1e],
          .docker-packer-light .bg-slate-950,
          .docker-packer-light .bg-slate-900,
          .docker-packer-light .bg-slate-800 {
            background-color: #ffffff !important;
          }
          .docker-packer-light .text-slate-200,
          .docker-packer-light .text-slate-300,
          .docker-packer-light .text-slate-400,
          .docker-packer-light .text-slate-500 {
            color: #334155 !important;
          }
          .docker-packer-light .shadow-inner { box-shadow: none !important; }
          .docker-packer-light .bg-gray-50 { background-color: #F9FAFB !important; }
          .docker-packer-light code, .docker-packer-light pre { color: #0f172a !important; background: #F8FAFC !important; }
        }
      `}</style>
    </div>
  );
}

function FeatureBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-slate-600 shadow-sm">
      <span className="text-cyan-600">{icon}</span>
      <span className="font-medium">{text}</span>
    </div>
  );
}