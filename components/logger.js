const tag = '[rocom]'

const log = {
  i: (...args) => logger.info(tag, ...args),
  w: (...args) => logger.warn(tag, ...args),
  e: (...args) => logger.error(tag, ...args),
  d: (...args) => logger.debug?.(tag, ...args)
}

export default log
