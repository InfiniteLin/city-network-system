#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
城市通讯系统启动脚本
======================
启动后端 Uvicorn (8000) 和前端 Vite (5173)
包含自动化测试和诊断功能

使用: python start_all.py
    按 Ctrl+C 停止所有服务
"""

import subprocess
import time
import requests
import sys
import os
import signal
from pathlib import Path

# 获取脚本所在目录
SCRIPT_DIR = Path(__file__).parent.absolute()
os.chdir(SCRIPT_DIR)

# 确保标准输出为 UTF-8
if sys.stdout.encoding.lower() not in ['utf-8', 'utf8']:
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("=" * 60)
print("城市通讯系统启动脚本")
print("=" * 60)

# 全局进程列表
processes = []

def start_backend():
    """启动后端服务器"""
    print("\n[1/5] 启动后端 Uvicorn 服务器（0.0.0.0:8001）...")
    try:
        backend_dir = SCRIPT_DIR / 'backend'
        cmd = [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
        
        proc = subprocess.Popen(
            cmd,
            cwd=str(backend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        processes.append(proc)
        print(f"     OK - 后端进程已启动，PID: {proc.pid}")
        return proc
    except Exception as e:
        print(f"     ERROR - 启动失败: {e}")
        return None

def check_backend():
    """检查后端是否就绪"""
    print("\n[2/5] 等待后端初始化（最多 15 秒）...")
    for i in range(30):
        try:
            response = requests.get("http://localhost:8001/health", timeout=2)
            if response.status_code == 200:
                print("     OK - 后端已就绪")
                return True
        except:
            pass
        if i % 5 == 0:
            print(f"     等待中... ({i}/30)")
        time.sleep(0.5)
    
    print("     ERROR - 后端未在规定时间内启动")
    return False

def start_frontend():
    """启动前端服务器"""
    print("\n[3/5] 启动前端 Vite 服务器（localhost:5173）...")
    try:
        frontend_dir = SCRIPT_DIR / 'frontend'
        
        # Windows 下使用 shell=True 以便正确识别 npm 命令
        if sys.platform.startswith('win'):
            cmd = "npm run dev"
            proc = subprocess.Popen(
                cmd,
                cwd=str(frontend_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                shell=True,
            )
        else:
            cmd = ["npm", "run", "dev"]
            proc = subprocess.Popen(
                cmd,
                cwd=str(frontend_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        
        processes.append(proc)
        print(f"     OK - 前端进程已启动，PID: {proc.pid}")
        return proc
    except Exception as e:
        print(f"     WARNING - 启动失败: {e}")
        print("     提示: 请确保已安装 Node.js 和 npm")
        return None

def test_endpoints():
    """测试关键端点"""
    print("\n[4/5] 测试后端端点...")
    
    tests = [
        ("GET /health", "http://localhost:8001/health"),
        ("GET /topology/status", "http://localhost:8001/topology/status"),
        ("GET /cities", "http://localhost:8001/cities"),
    ]
    
    for name, url in tests:
        try:
            response = requests.get(url, timeout=3)
            status = "OK" if 200 <= response.status_code < 300 else "ERROR"
            print(f"     {status} - {name:<30} -> {response.status_code}")
        except Exception as e:
            print(f"     ERROR - {name:<30} -> {str(e)[:50]}")

def print_summary():
    """打印启动总结"""
    print("\n" + "=" * 60)
    print("[5/5] 启动完成")
    print("=" * 60)
    print("\n启动的服务：")
    print(f"  - 后端 API:    http://localhost:8001")
    print(f"  - 前端应用:    http://localhost:5173")
    print(f"  - API 文档:    http://localhost:8001/docs")
    print("\n测试流程：")
    print(f"  1. 打开浏览器访问 http://localhost:5173")
    print(f"  2. 进入 MapOverlay 标签页")
    print(f"  3. 上传 test_data/test_basic_5cities.csv 文件")
    print(f"  4. 进入 CityCommunication 标签页")
    print(f"  5. 选择源城市和目标城市，发送加密消息")
    print("\n说明：")
    print(f"  - 按 Ctrl+C 停止所有服务")
    print(f"  - 进程数: {len(processes)}")
    print("=" * 60 + "\n")

# 执行启动流程
try:
    backend_proc = start_backend()
    if not backend_proc:
        sys.exit(1)
    
    if not check_backend():
        sys.exit(1)
    
    frontend_proc = start_frontend()
    # 前端可能启动较慢，不强制检查
    
    test_endpoints()
    print_summary()
    
    # 保持运行
    print("Press Ctrl+C to stop...\n")
    while True:
        time.sleep(1)
        # 检查进程是否还活着
        for proc in processes[:]:
            if proc.poll() is not None:
                print(f"WARNING - 进程 {proc.pid} 已退出，返回码: {proc.returncode}")
                processes.remove(proc)

except KeyboardInterrupt:
    print("\n\n正在关闭所有进程...")
    for proc in processes:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except:
            proc.kill()
    print("OK - 已关闭")
