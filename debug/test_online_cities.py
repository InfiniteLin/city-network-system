#!/usr/bin/env python3
"""
测试在线城市端点
"""
import requests
import json
import time
import asyncio
from websockets.client import connect

async def test_websocket_connection(city):
    """测试WebSocket连接"""
    uri = f"ws://localhost:8000/ws/{city}"
    try:
        async with connect(uri) as websocket:
            print(f"✓ {city} WebSocket连接成功")
            await asyncio.sleep(0.5)
            return True
    except Exception as e:
        print(f"✗ {city} WebSocket连接失败: {e}")
        return False

def test_cities_endpoint():
    """测试/cities端点"""
    url = "http://localhost:8000/cities"
    try:
        response = requests.get(url)
        print(f"\n测试 /cities 端点:")
        print(f"HTTP状态码: {response.status_code}")
        data = response.json()
        print(f"响应数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        if "cities" in data:
            print(f"✓ 在线城市列表: {data['cities']}")
            print(f"  数量: {len(data['cities'])}")
        else:
            print(f"✗ 响应中没有'cities'字段")
            
        return data
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return None

async def main():
    """主测试函数"""
    print("=" * 60)
    print("城市在线状态测试")
    print("=" * 60)
    
    # 测试几个城市的WebSocket连接
    cities = ["北京", "上海", "广州"]
    
    print("\n1. 建立WebSocket连接...")
    tasks = [test_websocket_connection(city) for city in cities]
    results = await asyncio.gather(*tasks)
    
    print("\n2. 等待1秒...")
    await asyncio.sleep(1)
    
    print("\n3. 检查/cities端点...")
    test_cities_endpoint()
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
