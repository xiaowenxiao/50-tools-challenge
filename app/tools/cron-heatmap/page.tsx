'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cron } from 'croner';

// 定义单元格数据结构
type CellData = {
  count: number;
  tasks: string[];
};

// 翻译字典
const TRANSLATIONS = {
  zh: {
    title: 'Cron 任务调度热力图',
    visualizing: '当前预览日期',
    idle: '空闲',
    busy: '繁忙',
    congested: '拥堵',
    editorTitle: 'Crontab 编辑器',
    wrapOn: '自动换行: 开',
    wrapOff: '自动换行: 关',
    visualizationTitle: '24小时负载分布',
    highLoad: '⚠️ 检测到高负载节点',
    taskCount: '任务数',
    noTasks: '😴 当前时段无任务计划',
    taskLabel: '任务',
    close: '关闭',
    back: '返回',
    legend: {
        l0: '空闲',
        l1: '1个',
        l2: '3个',
        l3: '4个+ (拥堵)'
    }
  },
  en: {
    title: 'Cron Schedule Heatmap',
    visualizing: 'Visualizing',
    idle: 'Idle',
    busy: 'Busy',
    congested: 'Congested',
    editorTitle: 'Crontab Editor',
    wrapOn: 'Wrap: ON',
    wrapOff: 'Wrap: OFF',
    visualizationTitle: '24H Load Distribution',
    highLoad: '⚠️ High Load Detected',
    taskCount: 'Tasks',
    noTasks: '😴 No tasks scheduled',
    taskLabel: 'Task',
    close: 'Close',
    back: 'Back',
    legend: {
        l0: 'Idle',
        l1: '1 Task',
        l2: '3 Tasks',
        l3: '4+ (High Load)'
    }
  }
};

const DEMO_CRONTAB = `# ┌───────────── 分钟 (0 - 59)
# │ ┌───────────── 小时 (0 - 23)
# │ │ ┌───────────── 日期 (1 - 31)
# │ │ │ ┌───────────── 月份 (1 - 12)
# │ │ │ │ ┌───────────── 星期 (0 - 6) (周日=0)
# │ │ │ │ │
# * * * * * <要执行的命令>
# ---------------------------------------------------------

# 🟢 [状态：健康] 普通监控 (每30分钟执行一次)
# > 对应图表显示：绿色格子 (1个任务)
*/30 * * * * /usr/bin/monitor-health.sh

# 🟡 [状态：繁忙] 早上 08:05 业务高峰
# > 对应图表显示：黄色格子 (3个任务并发)
5 8 * * * /usr/bin/send-daily-email.py
5 8 * * * /usr/bin/generate-report.sh --finance --output=/var/www/html/reports/daily
5 8 * * * /usr/bin/check-inventory.php

# 🔴 [状态：拥堵] 午夜 00:00 维护风暴
# > 对应图表显示：红色格子 (5个任务并发 -> 危险!)
0 0 * * * /usr/bin/backup-db.sh --full
0 0 * * * /usr/bin/rotate-logs.sh
0 0 * * * /usr/bin/rsync-static.sh
0 0 * * * /usr/bin/cleanup-tmp.sh
0 0 * * * /usr/bin/calculate-stats.py

# 🔵 [其他] 复杂的混合频率
15,45 9-18 * * * /usr/bin/sync-order-status.sh
`;

export default function CronHeatmap() {
  const [input, setInput] = useState(DEMO_CRONTAB);
  const [heatmapData, setHeatmapData] = useState<CellData[][]>([]);
  const [maxLoad, setMaxLoad] = useState(0);
  const [currentDateStr, setCurrentDateStr] = useState('');
  
  const [selectedCell, setSelectedCell] = useState<{h: number, m: number, data: CellData} | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{h: number, m: number} | null>(null);
  const [wordWrap, setWordWrap] = useState(false); 
  
  // 🌟 语言状态
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const t = TRANSLATIONS[lang]; // 当前语言包

  useEffect(() => {
    const now = new Date();
    // 根据语言格式化日期
    setCurrentDateStr(now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }));
    
    now.setHours(0, 0, 0, 0); 
    const startDate = new Date(now);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000); 

    const grid: CellData[][] = Array.from({ length: 24 }, () => 
      Array.from({ length: 60 }, () => ({ count: 0, tasks: [] }))
    );
    let max = 0;
    
    const lines = input.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

    lines.forEach((line) => {
      try {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return;
        const expression = parts.slice(0, 5).join(' ');
        const command = parts.slice(5).join(' ') || '(无命令详情)';
        
        const job = new Cron(expression);
        let currentPointer = new Date(startDate.getTime() - 1);
        
        while (true) {
          const nextRun = job.nextRun(currentPointer);
          if (!nextRun || nextRun >= endDate) break;

          const diffMs = nextRun.getTime() - startDate.getTime();
          const diffMinutes = diffMs / 1000 / 60;

          if (diffMinutes >= 0 && diffMinutes < 24 * 60) {
              const hourIndex = Math.floor(diffMinutes / 60);
              const minuteIndex = Math.round(diffMinutes % 60);
              if (hourIndex >= 0 && hourIndex < 24 && minuteIndex >= 0 && minuteIndex < 60) {
                  const cell = grid[hourIndex][minuteIndex];
                  cell.count += 1;
                  cell.tasks.push(command);
                  if (cell.count > max) max = cell.count;
              }
          }
          currentPointer = nextRun;
        }
      } catch (err) {}
    });
    setHeatmapData(grid);
    setMaxLoad(max);
  }, [input, lang]); // 语言变化时重新计算(主要是日期格式)

  const getCellColorClass = (count: number) => {
    if (count === 0) return 'bg-slate-100 border-slate-200'; 
    if (count === 1) return 'bg-emerald-300 border-emerald-400'; 
    if (count === 2) return 'bg-emerald-500 border-emerald-600';
    if (count === 3) return 'bg-yellow-400 border-yellow-500'; 
    if (count >= 4) return 'bg-red-500 border-red-600'; 
    return 'bg-slate-100';
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 font-sans text-slate-900 select-none flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-4 px-2">
         <div className="flex items-center gap-4">
             <Link href="/" className="flex items-center text-slate-500 hover:text-slate-900 transition-colors group">
                <span className="text-xl font-bold mr-1 group-hover:-translate-x-1 transition-transform">←</span>
                <span className="text-sm font-medium">{t.back}</span>
             </Link>
             <h1 className="text-xl font-bold text-slate-800 tracking-tight ml-2">{t.title}</h1>
         </div>
         <div className="flex items-center gap-4 text-xs">
            {/* 语言切换器 */}
            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                <button 
                    onClick={() => setLang('zh')}
                    className={`px-3 py-1 rounded-md transition-all ${lang === 'zh' ? 'bg-slate-100 text-slate-900 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    中
                </button>
                <button 
                    onClick={() => setLang('en')}
                    className={`px-3 py-1 rounded-md transition-all ${lang === 'en' ? 'bg-slate-100 text-slate-900 font-bold shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    En
                </button>
            </div>

            <div className="text-slate-400 font-medium hidden md:block border-l border-slate-200 pl-4">
               {t.visualizing}: <span className="text-slate-700">{currentDateStr}</span>
            </div>
            
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200"></span> 0</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 border border-emerald-400"></span> 1</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 border border-yellow-500"></span> 3</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 border border-red-600"></span> 4+</span>
            </div>
         </div>
      </div>

      <div 
          className="flex-1 flex bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 80px)' }}
      >
        {/* Code Editor */}
        <div className="w-[420px] flex flex-col bg-[#FAFAFA] border-r border-slate-200 shrink-0 relative z-10">
           <div className="h-10 border-b border-slate-200 flex items-center px-4 bg-white shrink-0 justify-between">
              <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E24]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29]"></div>
              </div>
              
              <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-400">{t.editorTitle}</span>
                  <button 
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        wordWrap 
                        ? 'bg-blue-50 text-blue-600 border-blue-200' 
                        : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                    }`}
                  >
                    {wordWrap ? t.wrapOn : t.wrapOff}
                  </button>
              </div>
           </div>
           
           <div className="flex-1 relative">
             <textarea
               value={input}
               onChange={(e) => setInput(e.target.value)}
               className={`
                   absolute inset-0 w-full h-full p-4 font-mono text-xs leading-6 bg-[#FAFAFA] text-slate-600 resize-none outline-none border-none
                   ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}
               `}
               spellCheck={false}
             />
           </div>
        </div>

        {/* Visualization */}
        <div className="flex-1 bg-white relative flex flex-col overflow-hidden min-w-[500px]">
          <div className="h-10 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.visualizationTitle}</span>
              {maxLoad > 3 && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 animate-pulse">
                    {t.highLoad}
                </span>
              )}
          </div>

          <div className="flex-1 overflow-auto p-8 bg-white custom-scrollbar flex justify-center">
             <div className="min-w-[840px] w-[900px]">
                <div className="flex text-[10px] text-slate-300 mb-2 pl-14 font-mono w-full">
                    <div className="flex-1 border-l border-slate-100 pl-1">00m</div>
                    <div className="flex-1 border-l border-slate-100 pl-1">15m</div>
                    <div className="flex-1 border-l border-slate-100 pl-1">30m</div>
                    <div className="flex-1 border-l border-slate-100 pl-1">45m</div>
                </div>

                <div className="flex flex-col gap-[3px]" onMouseLeave={() => setHoverCoord(null)}>
                    {heatmapData.map((minutes, hourIndex) => (
                        <div key={hourIndex} className="flex items-center gap-2">
                            <div className="w-12 text-[11px] text-slate-400 font-mono text-right pt-[2px]">
                                {String(hourIndex).padStart(2, '0')}:00
                            </div>
                            
                            <div className="flex-1 grid grid-cols-[repeat(60,1fr)] gap-[2px]">
                                {minutes.map((cell, minuteIndex) => {
                                    const isHovered = hoverCoord?.h === hourIndex || hoverCoord?.m === minuteIndex;
                                    return (
                                        <div
                                            key={minuteIndex}
                                            onClick={() => setSelectedCell({ h: hourIndex, m: minuteIndex, data: cell })}
                                            onMouseEnter={() => setHoverCoord({ h: hourIndex, m: minuteIndex })}
                                            className={`
                                                h-5 rounded-[2px] transition-all duration-100
                                                ${getCellColorClass(cell.count)}
                                                ${cell.count > 0 ? 'hover:scale-110 hover:shadow-sm cursor-pointer z-10' : 'cursor-default'}
                                                ${isHovered ? 'opacity-100 ring-1 ring-slate-300 z-10' : 'opacity-100'}
                                            `}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-slate-900/5">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <div className="bg-slate-900 text-white font-mono font-bold px-2 py-1 rounded text-sm shadow-sm">
                            {String(selectedCell.h).padStart(2, '0')}:{String(selectedCell.m).padStart(2, '0')}
                        </div>
                        <span className="text-sm text-slate-500">
                            {t.taskCount}: <strong className="text-slate-900">{selectedCell.data.count}</strong>
                        </span>
                    </div>
                    <button onClick={() => setSelectedCell(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto p-0">
                    {selectedCell.data.count === 0 ? (
                        <div className="p-10 text-center text-slate-400 text-sm">{t.noTasks}</div>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {selectedCell.data.tasks.map((task, idx) => (
                                <li key={idx} className="px-5 py-3 hover:bg-slate-50 transition-colors group">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.taskLabel} {idx + 1}</span>
                                        <code className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-1.5 rounded block break-all">
                                            {task}
                                        </code>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="bg-slate-50 px-5 py-3 text-right border-t border-slate-100">
                    <button onClick={() => setSelectedCell(null)} className="text-xs font-bold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all">{t.close}</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}