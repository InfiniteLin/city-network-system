/**
 * HTTP 请求工具
 * 封装 fetch API，提供统一的错误处理和超时控制
 */

import { REQUEST_CONFIG } from '../config/api'

/**
 * 创建带超时的 fetch 请求
 */
export async function fetchWithTimeout(url, options = {}, timeout = REQUEST_CONFIG.TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout}ms): ${url}`)
    }
    throw error
  }
}

/**
 * GET 请求
 */
export async function get(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    ...options
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.json()
}

/**
 * POST 请求
 */
export async function post(url, data, options = {}) {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify(data),
    ...options
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.json()
}

/**
 * 带重试的请求
 */
export async function fetchWithRetry(fetchFn, retries = REQUEST_CONFIG.RETRY_ATTEMPTS) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchFn()
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, REQUEST_CONFIG.RETRY_DELAY * (i + 1)))
    }
  }
}

export default {
  fetchWithTimeout,
  get,
  post,
  fetchWithRetry
}
