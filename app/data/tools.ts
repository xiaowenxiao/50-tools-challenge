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
    // 标题要霸气一点
    title: "Cron 任务拥堵热力图", 
    description: "可视化分析 Crontab 负载，自动识别高并发“爆炸”时刻，DevOps 必备。",
    status: "Live", 
    link: "/tools/cron-heatmap", // 指向新页面
    category: "DevOps",
    icon: "🔥", // 用个火的图标
  },
  {
    id: 2,
    title: "小红书爆款标题助手",
    description: "利用 AI 分析痛点，生成 10 个高点击率标题。",
    status: "Planned",
    link: "#",
    category: "Marketing",
    icon: "🔥",
  },
  {
    id: 3,
    title: "SQL 智能优化器",
    description: "分析慢查询日志，给出索引优化建议。",
    status: "Planned",
    link: "#",
    category: "DevOps",
    icon: "🐘",
  },
];
