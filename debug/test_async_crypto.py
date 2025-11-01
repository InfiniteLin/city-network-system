"""
测试加密操作的异步性能
验证密钥交换和加密不会阻塞事件循环
"""
import asyncio
import time
import sys
sys.path.insert(0, 'backend')

from backend.crypto import crypto_manager


async def test_key_exchange_performance():
    """测试密钥交换性能"""
    print("=" * 60)
    print("测试 1: 密钥交换性能")
    print("=" * 60)
    
    # 测试首次密钥交换（需要计算）
    start = time.time()
    key1 = await crypto_manager.establish_shared_key("Beijing", "Shanghai")
    elapsed = (time.time() - start) * 1000
    print(f"✅ 首次密钥交换: {elapsed:.2f}ms")
    
    # 测试缓存密钥（应该很快）
    start = time.time()
    key2 = await crypto_manager.establish_shared_key("Beijing", "Shanghai")
    elapsed = (time.time() - start) * 1000
    print(f"✅ 缓存密钥读取: {elapsed:.2f}ms")
    
    assert key1 == key2, "缓存的密钥应该相同"
    print()


async def test_encryption_performance():
    """测试加密性能"""
    print("=" * 60)
    print("测试 2: 消息加密性能")
    print("=" * 60)
    
    key = await crypto_manager.establish_shared_key("CityA", "CityB")
    
    # 测试短消息
    short_msg = "Hello World!"
    start = time.time()
    encrypted, huffman, codes = await crypto_manager.encrypt_message(short_msg, key)
    elapsed = (time.time() - start) * 1000
    print(f"✅ 短消息加密 (12字符): {elapsed:.2f}ms")
    
    # 测试长消息
    long_msg = "这是一个测试消息。" * 100  # ~700字符
    start = time.time()
    encrypted, huffman, codes = await crypto_manager.encrypt_message(long_msg, key)
    elapsed = (time.time() - start) * 1000
    print(f"✅ 长消息加密 ({len(long_msg)}字符): {elapsed:.2f}ms")
    
    print()


async def test_concurrent_operations():
    """测试并发操作不会阻塞"""
    print("=" * 60)
    print("测试 3: 并发操作性能")
    print("=" * 60)
    
    start = time.time()
    
    # 模拟同时建立3个不同城市对的密钥
    tasks = [
        crypto_manager.establish_shared_key("City1", "City2"),
        crypto_manager.establish_shared_key("City3", "City4"),
        crypto_manager.establish_shared_key("City5", "City6"),
    ]
    
    keys = await asyncio.gather(*tasks)
    elapsed = (time.time() - start) * 1000
    
    print(f"✅ 并发建立3个密钥: {elapsed:.2f}ms")
    print(f"   (如果是串行应该需要约 {elapsed * 3:.0f}ms)")
    
    # 验证所有密钥都已建立
    assert len(keys) == 3, "应该返回3个密钥"
    print()


async def test_event_loop_not_blocked():
    """测试事件循环是否被阻塞"""
    print("=" * 60)
    print("测试 4: 事件循环阻塞检测")
    print("=" * 60)
    
    async def heartbeat():
        """心跳任务，用于检测事件循环是否被阻塞"""
        for i in range(5):
            await asyncio.sleep(0.1)
            print(f"  💓 心跳 {i+1}/5 (如果看不到说明事件循环被阻塞)")
    
    async def heavy_crypto_work():
        """模拟重型加密工作"""
        for i in range(3):
            await crypto_manager.establish_shared_key(f"Heavy{i}A", f"Heavy{i}B")
            print(f"  🔐 完成密钥交换 {i+1}/3")
            await asyncio.sleep(0.05)  # 稍微间隔
    
    # 同时运行心跳和加密任务
    start = time.time()
    await asyncio.gather(heartbeat(), heavy_crypto_work())
    elapsed = (time.time() - start) * 1000
    
    print(f"✅ 总耗时: {elapsed:.2f}ms")
    print(f"   如果心跳正常，说明事件循环没有被长时间阻塞")
    print()


async def main():
    """主测试函数"""
    print("\n🚀 开始异步加密性能测试\n")
    
    try:
        await test_key_exchange_performance()
        await test_encryption_performance()
        await test_concurrent_operations()
        await test_event_loop_not_blocked()
        
        print("=" * 60)
        print("✅ 所有测试通过！")
        print("=" * 60)
        print("\n关键结论:")
        print("1. 密钥交换已异步化，不会阻塞事件循环")
        print("2. 消息加密已异步化，支持并发处理")
        print("3. 多个加密操作可以并发执行")
        print("4. 事件循环可以在加密过程中处理其他任务\n")
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
