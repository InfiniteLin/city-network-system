"""
加密解密模块
实现AES加密、哈夫曼编码和密钥协商
"""
import hashlib
import hmac
import secrets
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Tuple, Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
import base64
import heapq
from collections import Counter

# 线程池用于CPU密集型操作
# 增加 max_workers 以支持更多并发加密请求
_executor = ThreadPoolExecutor(max_workers=16)


class HuffmanEncoder:
    """哈夫曼编码器"""
    
    def __init__(self):
        self.freq = {}
        self.codes = {}
        self.tree = None
    
    def _build_frequency_table(self, text: str) -> Dict[str, int]:
        """构建字符频率表"""
        return Counter(text)
    
    def _build_huffman_tree(self, freq: Dict[str, int]):
        """构建哈夫曼树"""
        if len(freq) == 1:
            # 特殊情况：只有一个字符
            char = list(freq.keys())[0]
            self.tree = {'char': char, 'freq': freq[char], 'left': None, 'right': None}
            return
        
        # 使用堆来构建哈夫曼树
        heap = []
        for char, count in freq.items():
            heapq.heappush(heap, (count, id({'char': char}), {'char': char, 'freq': count, 'left': None, 'right': None}))
        
        while len(heap) > 1:
            left = heapq.heappop(heap)[2]
            right = heapq.heappop(heap)[2]
            
            merged = {
                'char': None,
                'freq': left['freq'] + right['freq'],
                'left': left,
                'right': right
            }
            heapq.heappush(heap, (merged['freq'], id(merged), merged))
        
        self.tree = heap[0][2]
    
    def _build_codes(self, node, code=""):
        """递归构建编码表"""
        if node['char'] is not None:
            self.codes[node['char']] = code if code else "0"
        else:
            if node['left']:
                self._build_codes(node['left'], code + "0")
            if node['right']:
                self._build_codes(node['right'], code + "1")
    
    def encode(self, text: str) -> Tuple[str, Dict[str, str]]:
        """编码文本"""
        if not text:
            return "", {}
        
        self.freq = self._build_frequency_table(text)
        self._build_huffman_tree(self.freq)
        self.codes = {}
        self._build_codes(self.tree)
        
        # 编码文本
        encoded = ''.join(self.codes[char] for char in text)
        return encoded, self.codes
    
    def decode(self, encoded_text: str, codes: Dict[str, str]) -> str:
        """解码文本"""
        if not encoded_text or not codes:
            return ""
        
        # 反转编码表
        reverse_codes = {v: k for k, v in codes.items()}
        
        decoded = ""
        current_code = ""
        
        for bit in encoded_text:
            current_code += bit
            if current_code in reverse_codes:
                decoded += reverse_codes[current_code]
                current_code = ""
        
        return decoded


class CryptoManager:
    """加密管理器"""
    
    def __init__(self):
        # 不在此保留共享的 HuffmanEncoder 实例，避免多线程/并发时的可变状态冲突
        # 每次编码/解码都创建独立实例
        self.shared_secrets = {}  # 存储城市间的共享密钥
    
    def generate_key(self) -> bytes:
        """生成随机密钥"""
        return Fernet.generate_key()
    
    def derive_key_from_password(self, password: str, salt: bytes = None) -> bytes:
        """从密码派生密钥"""
        if salt is None:
            salt = secrets.token_bytes(16)
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        return key
    
    def _encrypt_message_sync(self, message: str, key: bytes) -> Tuple[str, str, Dict[str, str]]:
        """加密消息同步实现（在线程池中运行）"""
        # 1. 哈夫曼编码：为避免并发时共享可变状态导致的问题，使用独立的编码器实例
        encoder = HuffmanEncoder()
        huffman_encoded, huffman_codes = encoder.encode(message)
        
        # 2. AES加密
        fernet = Fernet(key)
        encrypted_data = fernet.encrypt(huffman_encoded.encode())
        encrypted_b64 = base64.b64encode(encrypted_data).decode()
        
        return encrypted_b64, huffman_encoded, huffman_codes
    
    async def encrypt_message(self, message: str, key: bytes) -> Tuple[str, str, Dict[str, str]]:
        """加密消息：AES加密 + 哈夫曼编码（异步版本）"""
        loop = asyncio.get_event_loop()
        # 在线程池中运行，避免长消息的哈夫曼编码阻塞事件循环
        return await loop.run_in_executor(_executor, self._encrypt_message_sync, message, key)
    
    def decrypt_message(self, encrypted_b64: str, key: bytes, huffman_codes: Dict[str, str]) -> str:
        """解密消息：哈夫曼解码 + AES解密"""
        try:
            # 1. AES解密
            fernet = Fernet(key)
            encrypted_data = base64.b64decode(encrypted_b64.encode())
            huffman_encoded = fernet.decrypt(encrypted_data).decode()
            
            # 2. 哈夫曼解码
            # 使用本地 HuffmanEncoder 实例进行解码，避免依赖共享实例状态
            decoder = HuffmanEncoder()
            message = decoder.decode(huffman_encoded, huffman_codes)
            
            return message
        except Exception as e:
            raise ValueError(f"解密失败: {str(e)}")
    
    def _key_exchange_sync(self, city1: str, city2: str) -> Tuple[bytes, bytes]:
        """密钥协商同步实现（在线程池中运行）"""
        # 生成随机数作为私钥
        private_key1 = secrets.randbits(256)
        private_key2 = secrets.randbits(256)
        
        # 使用简单的模运算（实际应用中应使用更安全的算法）
        p = 2**256 - 189  # 大质数
        g = 2  # 生成元
        
        # 计算公钥（CPU密集型操作）
        public_key1 = pow(g, private_key1, p)
        public_key2 = pow(g, private_key2, p)
        
        # 计算共享密钥
        shared_key1 = pow(public_key2, private_key1, p)
        shared_key2 = pow(public_key1, private_key2, p)
        
        # 将共享密钥转换为Fernet密钥
        key1 = self._derive_fernet_key(shared_key1)
        key2 = self._derive_fernet_key(shared_key2)
        
        # 存储共享密钥
        key_pair = f"{city1}-{city2}" if city1 < city2 else f"{city2}-{city1}"
        self.shared_secrets[key_pair] = key1
        
        return key1, key2
    
    async def key_exchange(self, city1: str, city2: str) -> Tuple[bytes, bytes]:
        """密钥协商：Diffie-Hellman风格的密钥交换（异步版本）"""
        loop = asyncio.get_event_loop()
        # 在线程池中运行CPU密集型操作，避免阻塞事件循环
        return await loop.run_in_executor(_executor, self._key_exchange_sync, city1, city2)
    
    def _derive_fernet_key(self, shared_key: int) -> bytes:
        """从共享密钥派生Fernet密钥"""
        key_bytes = shared_key.to_bytes(32, 'big')
        return base64.urlsafe_b64encode(key_bytes)
    
    def get_shared_key(self, city1: str, city2: str) -> Optional[bytes]:
        """获取两个城市间的共享密钥"""
        key_pair = f"{city1}-{city2}" if city1 < city2 else f"{city2}-{city1}"
        return self.shared_secrets.get(key_pair)
    
    async def establish_shared_key(self, city1: str, city2: str) -> bytes:
        """建立两个城市间的共享密钥（异步版本）"""
        existing_key = self.get_shared_key(city1, city2)
        if existing_key:
            return existing_key
        
        key1, key2 = await self.key_exchange(city1, city2)
        return key1


# 全局加密管理器实例
crypto_manager = CryptoManager()
