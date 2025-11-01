#!/usr/bin/env python3
"""测试 /cities 端点和路由功能"""

import requests
import json
import asyncio
import websockets
import sys

BASE_URL = "http://localhost:8000"

async def test_websocket_connection(city):
    """测试 WebSocket 连接"""
    try:
        uri = f"ws://localhost:8000/ws/{city}"
        async with websockets.connect(uri) as websocket:
            print(f"✅ {city} WebSocket 连接成功")
            return True
    except Exception as e:
        print(f"❌ {city} WebSocket 连接失败: {e}")
        return False

def test_cities_endpoint():
    """测试 /cities 端点"""
    try:
        response = requests.get(f"{BASE_URL}/cities")
        print(f"\n📍 /cities 响应:")
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        cities = data.get('cities', [])
        print(f"\n🏙️  在线城市列表: {cities}")
        print(f"活跃连接数: {data.get('active_connections', 0)}")
        
        return cities
    except Exception as e:
        print(f"❌ /cities 端点测试失败: {e}")
        return []

def test_topology():
    """检查拓扑是否加载"""
    try:
        response = requests.get(f"{BASE_URL}/topology/status")
        print(f"\n🗺️  拓扑状态:")
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
        return data
    except Exception as e:
        print(f"⚠️  拓扑状态查询失败: {e}")
        return {}

def test_route():
    """测试路由查询"""
    try:
        response = requests.get(f"{BASE_URL}/route/北京/上海")
        print(f"\n🛣️  路由查询 (北京 -> 上海):")
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
        return data
    except Exception as e:
        print(f"⚠️  路由查询失败: {e}")
        return {}

async def main():
    """主函数"""
    print("=" * 60)
    print("🔍 城市网络系统诊断")
    print("=" * 60)
    
    # 1. 测试后端连接
    print("\n1️⃣  测试后端连接...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✅ 后端连接正常")
        else:
            print(f"❌ 后端返回异常状态码: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ 无法连接到后端: {e}")
        print("   请确保后端已启动: python backend/main.py")
        return
    
    # 2. 测试 WebSocket 连接
    print("\n2️⃣  测试 WebSocket 连接...")
    test_cities = ['北京', '上海', '广州', '深圳']
    tasks = [test_websocket_connection(city) for city in test_cities[:2]]
    await asyncio.gather(*tasks)
    
    # 给 WebSocket 连接时间稳定
    await asyncio.sleep(1)
    
    # 3. 测试 /cities 端点
    print("\n3️⃣  测试 /cities 端点...")
    online_cities = test_cities_endpoint()
    
    # 4. 检查拓扑
    print("\n4️⃣  检查拓扑加载状态...")
    topology = test_topology()
    
    # 5. 测试路由
    print("\n5️⃣  测试路由查询...")
    test_route()
    
    print("\n" + "=" * 60)
    print("📊 诊断总结:")
    print(f"   - 后端正常: ✅")
    print(f"   - 在线城市数: {len(online_cities)}")
    print(f"   - 拓扑城市数: {topology.get('cities', 0)}")
    print(f"   - 拓扑边数: {topology.get('edges', 0)}")
    print(f"   - MST边数: {topology.get('mst_edges', 0)}")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
