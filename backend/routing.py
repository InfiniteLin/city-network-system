"""
路由计算模块
实现基于最小生成树的消息路由算法
"""
from typing import List, Dict, Tuple
import heapq

class RoutingManager:
    """路由管理器"""
    
    def __init__(self):
        self.cities = []  # 城市列表
        self.edges = []   # 边列表
        self.mst_edges = []  # 最小生成树边
        self.adjacency_list = {}  # 邻接表
        self.city_to_index = {}  # 城市名到索引的映射
        self.index_to_city = {}  # 索引到城市名的映射
        # 避免在未计算MST时访问属性报错
        self.mst_adjacency = {}
    
    def load_topology(self, cities: List[Dict], edges: List[Dict]):
        """加载城市拓扑数据"""
        self.cities = cities
        self.edges = edges
        
        # 建立城市名到索引的映射
        self.city_to_index = {city['name']: i for i, city in enumerate(cities)}
        self.index_to_city = {i: city['name'] for i, city in enumerate(cities)}
        
        # 构建邻接表
        self.adjacency_list = {i: [] for i in range(len(cities))}
        for edge in edges:
            u, v, w = edge['u'], edge['v'], edge['w']
            self.adjacency_list[u].append((v, w))
            self.adjacency_list[v].append((u, w))
        
        # 计算最小生成树
        self._compute_mst()
    
    def _compute_mst(self):
        """使用Kruskal算法计算最小生成树"""
        # 无边或无城市时，重置MST邻接并返回
        if not self.edges or not self.cities:
            self.mst_edges = []
            self.mst_adjacency = {i: [] for i in range(len(self.cities))}
            return
        
        n = len(self.cities)
        parent = list(range(n))
        rank = [0] * n
        
        def find(x):
            if parent[x] != x:
                parent[x] = find(parent[x])
            return parent[x]
        
        def union(x, y):
            x, y = find(x), find(y)
            if x == y:
                return False
            if rank[x] < rank[y]:
                x, y = y, x
            parent[y] = x
            if rank[x] == rank[y]:
                rank[x] += 1
            return True
        
        # 按权重排序边
        sorted_edges = sorted(self.edges, key=lambda x: x['w'])
        
        self.mst_edges = []
        for edge in sorted_edges:
            if union(edge['u'], edge['v']):
                self.mst_edges.append(edge)
                if len(self.mst_edges) == n - 1:
                    break
        
        # 构建MST的邻接表（即便不满 n-1 条边也保持结构存在）
        self.mst_adjacency = {i: [] for i in range(n)}
        for edge in self.mst_edges:
            u, v, w = edge['u'], edge['v'], edge['w']
            self.mst_adjacency[u].append((v, w))
            self.mst_adjacency[v].append((u, w))
    
    def find_route(self, source_city: str, target_city: str) -> List[str]:
        """使用BFS在最小生成树中找到从源城市到目标城市的路径"""
        # 基本校验：城市是否存在
        if source_city not in self.city_to_index or target_city not in self.city_to_index:
            return []
        # 拓扑是否加载
        if not hasattr(self, 'mst_adjacency') or self.mst_adjacency is None:
            self.mst_adjacency = {i: [] for i in range(len(self.cities))}
        if len(self.mst_adjacency) == 0:
            return []
        
        source_idx = self.city_to_index[source_city]
        target_idx = self.city_to_index[target_city]
        
        if source_idx == target_idx:
            return [source_city]
        
        # 使用BFS在MST中找路径
        queue = [(source_idx, [source_city])]
        visited = {source_idx}
        
        while queue:
            current_idx, path = queue.pop(0)
            
            for neighbor_idx, weight in self.mst_adjacency.get(current_idx, []):
                if neighbor_idx == target_idx:
                    return path + [target_city]
                
                if neighbor_idx not in visited:
                    visited.add(neighbor_idx)
                    neighbor_city = self.index_to_city[neighbor_idx]
                    queue.append((neighbor_idx, path + [neighbor_city]))
        
        return []  # 没有找到路径
    
    def get_intermediate_cities(self, source_city: str, target_city: str) -> List[str]:
        """获取消息传递路径上的所有中间城市（不包括源城市和目标城市）"""
        route = self.find_route(source_city, target_city)
        if len(route) <= 2:
            return []
        return route[1:-1]  # 排除源城市和目标城市
    
    def get_all_cities_in_route(self, source_city: str, target_city: str) -> List[str]:
        """获取消息传递路径上的所有城市（包括源城市和目标城市）"""
        return self.find_route(source_city, target_city)
    
    def is_connected(self, city1: str, city2: str) -> bool:
        """检查两个城市是否在MST中连通"""
        return len(self.find_route(city1, city2)) > 0


# 全局路由管理器实例
routing_manager = RoutingManager()
