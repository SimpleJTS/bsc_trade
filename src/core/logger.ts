// 日志工具模块 - 带时间戳和耗时统计

type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

interface TimerRecord {
  startTime: number;
  label: string;
}

const timers: Map<string, TimerRecord> = new Map();

// 格式化时间戳
function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
}

// 日志样式
const styles: Record<LogLevel, string> = {
  info: 'color: #4ecca3; font-weight: bold;',
  warn: 'color: #f0b90b; font-weight: bold;',
  error: 'color: #ff5252; font-weight: bold;',
  success: 'color: #00c853; font-weight: bold;',
  debug: 'color: #888; font-weight: normal;',
};

const levelLabels: Record<LogLevel, string> = {
  info: '信息',
  warn: '警告',
  error: '错误',
  success: '成功',
  debug: '调试',
};

// 基础日志函数
function log(level: LogLevel, module: string, message: string, data?: any) {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${levelLabels[level]}] [${module}]`;

  if (data !== undefined) {
    console.log(`%c${prefix} ${message}`, styles[level], data);
  } else {
    console.log(`%c${prefix} ${message}`, styles[level]);
  }
}

// 开始计时
export function timerStart(id: string, label: string): void {
  timers.set(id, {
    startTime: performance.now(),
    label,
  });
  log('info', '计时器', `⏱️ 开始: ${label}`);
}

// 结束计时并返回耗时
export function timerEnd(id: string): number {
  const timer = timers.get(id);
  if (!timer) {
    log('warn', '计时器', `未找到计时器: ${id}`);
    return 0;
  }

  const elapsed = performance.now() - timer.startTime;
  const elapsedMs = elapsed.toFixed(2);
  timers.delete(id);

  log('success', '计时器', `✅ 完成: ${timer.label} (耗时: ${elapsedMs}ms)`);
  return elapsed;
}

// 记录中间步骤耗时
export function timerStep(id: string, stepName: string): number {
  const timer = timers.get(id);
  if (!timer) {
    return 0;
  }

  const elapsed = performance.now() - timer.startTime;
  const elapsedMs = elapsed.toFixed(2);
  log('debug', '计时器', `  ├─ ${stepName} (累计: ${elapsedMs}ms)`);
  return elapsed;
}

// 创建模块日志器
export function createLogger(module: string) {
  return {
    info: (message: string, data?: any) => log('info', module, message, data),
    warn: (message: string, data?: any) => log('warn', module, message, data),
    error: (message: string, data?: any) => log('error', module, message, data),
    success: (message: string, data?: any) => log('success', module, message, data),
    debug: (message: string, data?: any) => log('debug', module, message, data),
  };
}

// 交易日志 - 特殊格式
export function logTransaction(action: string, details: Record<string, any>) {
  const timestamp = getTimestamp();
  console.log(
    `%c[${timestamp}] [交易] ${action}`,
    'color: #f0b90b; font-weight: bold; font-size: 14px;'
  );
  console.table(details);
}

// 导出便捷方法
export const logger = {
  wallet: createLogger('钱包'),
  token: createLogger('代币'),
  swap: createLogger('交易'),
  storage: createLogger('存储'),
  ui: createLogger('界面'),
  crypto: createLogger('加密'),
};
