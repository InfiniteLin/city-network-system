/**
 * 前端加密工具库
 * 用于演示加密过程（仅作参考，实际加密由后端完成）
 */

/**
 * 哈夫曼编码演示
 * @param {string} text 待编码文本
 * @returns {Object} { encoded: 编码结果, codes: 编码表, huffmanEncoded: 编码后的二进制字符串 }
 */
export function huffmanEncode(text) {
  if (!text) return { encoded: '', codes: {}, huffmanEncoded: '' }

  // 计算频率
  const freq = {}
  for (const char of text) {
    freq[char] = (freq[char] || 0) + 1
  }

  // 构建哈夫曼树并生成编码表
  const codes = {}
  
  if (Object.keys(freq).length === 1) {
    // 特殊情况：只有一个字符
    codes[Object.keys(freq)[0]] = '0'
  } else {
    // 使用堆构建哈夫曼树
    const heap = []
    
    for (const [char, count] of Object.entries(freq)) {
      heap.push({ char, freq: count, left: null, right: null })
    }
    
    // 排序堆
    heap.sort((a, b) => a.freq - b.freq)
    
    while (heap.length > 1) {
      const left = heap.shift()
      const right = heap.shift()
      
      const parent = {
        char: null,
        freq: left.freq + right.freq,
        left,
        right
      }
      
      heap.push(parent)
      heap.sort((a, b) => a.freq - b.freq)
    }
    
    const tree = heap[0]
    
    // 生成编码表
    const generateCodes = (node, code = '') => {
      if (node.char !== null) {
        codes[node.char] = code || '0'
      } else {
        if (node.left) generateCodes(node.left, code + '0')
        if (node.right) generateCodes(node.right, code + '1')
      }
    }
    
    generateCodes(tree)
  }

  // 编码文本
  const encoded = text.split('').map(char => codes[char]).join('')
  
  return {
    encoded,
    codes,
    huffmanEncoded: encoded
  }
}

/**
 * 模拟 AES 加密（前端只做演示，实际加密由后端完成）
 * @param {string} data 待加密数据
 * @returns {string} 加密后的数据（base64 编码）
 */
export function simulateAESEncrypt(data) {
  // 模拟 AES 加密的输出格式
  // 实际加密由后端完成，这里仅作演示
  const encoded = btoa(data)
  // 添加一些随机字符来模拟加密
  return encoded + '_' + Math.random().toString(36).substring(2, 15)
}

/**
 * 获取加密步骤信息
 * @param {string} originalMessage 原始消息
 * @returns {Object} 包含各个加密步骤的信息
 */
export function getEncryptionSteps(originalMessage) {
  const huffman = huffmanEncode(originalMessage)
  const aesEncrypted = simulateAESEncrypt(huffman.huffmanEncoded)
  
  return {
    original: originalMessage,
    huffmanEncoded: huffman.huffmanEncoded,
    huffmanCodes: huffman.codes,
    aesEncrypted: aesEncrypted,
    stats: {
      originalLength: originalMessage.length,
      huffmanLength: huffman.huffmanEncoded.length,
      compressionRatio: ((1 - huffman.huffmanEncoded.length / (originalMessage.length * 8)) * 100).toFixed(2)
    }
  }
}
