"""
后端功能测试脚本
用于验证后端加密、路由等功能是否正常
"""
import sys
import json
sys.path.insert(0, 'backend')

def test_crypto():
    """测试加密解密功能"""
    print("\n=== 测试加密解密功能 ===")
    from crypto import crypto_manager
    
    # 1. 生成密钥
    key = crypto_manager.generate_key()
    print(f"✅ 生成密钥: {key[:20]}...")
    
    # 2. 测试简单消息加密
    message = "Hello World"
    encrypted_b64, huffman_encoded, huffman_codes = crypto_manager.encrypt_message(message, key)
    
    print(f"✅ 原始消息: {message}")
    print(f"✅ 哈夫曼编码: {huffman_encoded}")
    print(f"✅ 哈夫曼码表: {huffman_codes}")
    print(f"✅ AES加密: {encrypted_b64[:50]}...")
    
    # 验证所有返回值都是可序列化的
    try:
        test_obj = {
            "encrypted_data": encrypted_b64,
            "huffman_encoded": huffman_encoded,
            "huffman_codes": huffman_codes
        }
        json_str = json.dumps(test_obj, ensure_ascii=False)
        print(f"✅ JSON序列化成功，长度: {len(json_str)}")
        
        # 反序列化测试
        parsed = json.loads(json_str)
        assert parsed["encrypted_data"] == encrypted_b64
        assert parsed["huffman_encoded"] == huffman_encoded
        assert parsed["huffman_codes"] == huffman_codes
        print("✅ JSON反序列化验证成功")
        
    except Exception as e:
        print(f"❌ JSON序列化失败: {e}")
        return False
    
    # 3. 测试解密
    decrypted = crypto_manager.decrypt_message(encrypted_b64, key, huffman_codes)
    print(f"✅ 解密消息: {decrypted}")
    
    if decrypted == message:
        print("✅ 加密解密测试通过！")
        return True
    else:
        print(f"❌ 解密结果不匹配！期望: {message}, 实际: {decrypted}")
        return False

def test_routing():
    """测试路由功能"""
    print("\n=== 测试路由功能 ===")
    from routing import routing_manager
    
    # 创建测试拓扑
    test_cities = [
        {"name": "北京", "longitude": 116.4074, "latitude": 39.9042},
        {"name": "上海", "longitude": 121.4737, "latitude": 31.2304},
        {"name": "广州", "longitude": 113.2644, "latitude": 23.1291}
    ]
    
    test_edges = [
        {"from": "北京", "to": "上海", "distance": 1000},
        {"from": "上海", "to": "广州", "distance": 1200}
    ]
    
    routing_manager.load_topology(test_cities, test_edges)
    print(f"✅ 加载拓扑: {len(test_cities)} 个城市, {len(test_edges)} 条边")
    
    # 测试路由查询
    route = routing_manager.get_all_cities_in_route("北京", "广州")
    print(f"✅ 北京 -> 广州 路由: {route}")
    
    expected_route = ["北京", "上海", "广州"]
    if route == expected_route:
        print("✅ 路由测试通过！")
        return True
    else:
        print(f"❌ 路由结果不匹配！期望: {expected_route}, 实际: {route}")
        return False

def test_shared_key():
    """测试共享密钥建立"""
    print("\n=== 测试共享密钥建立 ===")
    from crypto import crypto_manager
    
    city1 = "北京"
    city2 = "上海"
    
    key = crypto_manager.establish_shared_key(city1, city2)
    print(f"✅ 建立共享密钥: {city1} <-> {city2}")
    print(f"   密钥: {key[:20]}...")
    
    # 测试双向密钥一致性
    key2 = crypto_manager.get_shared_key(city1, city2)
    key3 = crypto_manager.get_shared_key(city2, city1)
    
    if key == key2 == key3:
        print("✅ 共享密钥一致性测试通过！")
        return True
    else:
        print("❌ 共享密钥不一致！")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("后端功能测试")
    print("=" * 60)
    
    results = []
    
    # 运行所有测试
    results.append(("加密解密", test_crypto()))
    results.append(("路由查询", test_routing()))
    results.append(("共享密钥", test_shared_key()))
    
    # 输出测试结果
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    
    for name, passed in results:
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"{name:20s} {status}")
    
    all_passed = all(r[1] for r in results)
    print("\n" + ("✅ 所有测试通过！" if all_passed else "❌ 部分测试失败"))
    
    sys.exit(0 if all_passed else 1)
