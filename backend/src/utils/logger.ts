import winston from 'winston'

const { combine, timestamp, printf, colorize } = winston.format

const myFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
})

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    myFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        myFormat
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
})

export function logInfo(module: string, message: string, details?: any) {
  logger.info(`[${module}] ${message}`, details)
}

export function logWarn(module: string, message: string, details?: any) {
  logger.warn(`[${module}] ${message}`, details)
}

export function logError(module: string, message: string, error?: any) {
  logger.error(`[${module}] ${message}`, error)
}