"""
测试拓扑数据是否正确加载
"""
import requests
import time

# 等待服务启动
time.sleep(2)

# 测试后端拓扑状态
print("=" * 60)
print("测试后端拓扑数据加载状态")
print("=" * 60)

try:
    response = requests.get('http://localhost:8000/topology/status')
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ 后端拓扑状态:")
        print(f"   城市数量: {data.get('cities_count', 0)}")
        print(f"   边数量: {data.get('edges_count', 0)}")
        print(f"   MST边数量: {data.get('mst_edges_count', 0)}")
        
        if data.get('cities_count', 0) > 0:
            print(f"\n城市列表:")
            for city in data.get('cities', []):
                print(f"   - {city}")
        
        if data.get('edges_count', 0) == 0:
            print("\n❌ 警告: 边数据为空！")
        else:
            print(f"\n✅ 边数据已加载: {data.get('edges_count', 0)} 条边")
    else:
        print(f"❌ 请求失败: {response.status_code}")
except Exception as e:
    print(f"❌ 错误: {e}")

print("\n" + "=" * 60)
