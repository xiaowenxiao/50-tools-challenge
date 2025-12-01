import React from 'react';
import { tools } from './data/tools';
import Link from 'next/link';

export default function Home() {
  // 计算进度
  const totalTools = 50;
  const completedTools = tools.filter(t => t.status === 'Live').length;
  // 哪怕有一个在 Building，也算一点点进度
  const inProgressTools = tools.filter(t => t.status === 'Building').length;
  const progressPercentage = ((completedTools + (inProgressTools * 0.5)) / totalTools) * 100;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      {/* Header */}
      <header className="max-w-5xl mx-auto py-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl mb-4">
          50 个 AI 小工具挑战
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          由 <span className="text-blue-600 font-bold">运维大虾</span> 构建。<br/>
          见证从 0 到 1 的独立开发之路。
        </p>

        {/* 进度条 */}
        <div className="mt-8 max-w-md mx-auto bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between text-sm font-medium text-gray-600 mb-2">
            <span>挑战进度</span>
            <span>{tools.length} / {totalTools} (规划中)</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-blue-600 h-4 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(progressPercentage, 5)}%` }} // 给个5%保底让它显示一点
            ></div>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-right">
             当前状态: {inProgressTools} 个开发中
          </p>
        </div>
      </header>

      {/* Grid List */}
      <main className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <div key={tool.id} className={`group relative bg-white p-6 rounded-xl border transition-all duration-200 hover:shadow-lg ${tool.status === 'Planned' ? 'border-dashed border-gray-300' : 'border-gray-200'}`}>
              
              <div className="absolute top-4 right-4">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                  tool.status === 'Live' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                  tool.status === 'Building' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' : 
                  'bg-gray-50 text-gray-600 ring-gray-500/10'
                }`}>
                  {tool.status === 'Building' && <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1.5 animate-pulse"></span>}
                  {tool.status}
                </span>
              </div>

              <div className="text-4xl mb-4">{tool.icon}</div>
              <h3 className="text-xl font-bold mb-2 text-gray-900 group-hover:text-blue-600 transition-colors">
                {tool.title}
              </h3>
              <p className="text-gray-500 text-sm mb-6 line-clamp-2">
                {tool.description}
              </p>

              {tool.status === 'Live' ? (
                <Link href={tool.link} className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
                  立即使用 &rarr;
                </Link>
              ) : (
                <span className="text-sm text-gray-400 cursor-not-allowed">
                  {tool.status === 'Building' ? '正在憋大招...' : '待开发'}
                </span>
              )}
            </div>
          ))}
          
          {/* 占位符 */}
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-gray-300 min-h-[200px]">
            <span className="text-2xl mb-2">🚀</span>
            <span className="text-sm font-medium">更多工具即将上线</span>
          </div>
        </div>
      </main>
    </div>
  );
}
