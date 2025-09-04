import { createLogger, format, transports } from 'winston'

export default createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'bot-error.log', level: 'error', dirname: 'logs'}),
    new transports.File({ filename: 'bot-combined.log', dirname: 'logs' })
  ]
});