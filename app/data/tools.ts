export interface Tool {
  id: number;
  title: string;
  description: string;
  status: 'Live' | 'Building' | 'Planned';
  link: string;
  category: string;
  icon: string;
}

export const tools: Tool[] = [
  {
    id: 1,
    title: "Cron 任务调度热力图",
    description: "可视化分析 Crontab 拥堵点，识别高负载风险，运维必备。",
    status: "Live", // 已上线
    link: "/tools/cron-heatmap",
    category: "DevOps",
    icon: "🔥",
  },
  {
    id: 2,
    title: "小红书爆款标题助手",
    description: "利用 AI 分析痛点，生成 10 个高点击率标题。",
    status: "Building", // 🚧 改为开发中
    link: "#",
    category: "Marketing",
    icon: "✍️",
  },
  {
    id: 3,
    title: "SQL 智能优化器",
    description: "分析慢查询日志，给出索引优化建议。",
    status: "Building", // 🚧 改为开发中
    link: "#",
    category: "DevOps",
    icon: "🐘",
  },
  // ... 后面可以留着占位
];