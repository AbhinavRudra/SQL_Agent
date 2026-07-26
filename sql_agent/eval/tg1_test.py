# import subprocess

# cmd = [
#     "docker",
#     "run",
#     "--rm",
#     "-it",
#     "--ipc",
#     "host",
#     "--gpus",
#     "all",
#     "--ulimit",
#     "memlock=-1",
#     "--ulimit",
#     "stack=67108864",
#     "-p",
#     "8000:8000",
#     "nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc20",
# ]

# subprocess.run(cmd, check=True)

import docker
import requests

client = docker.from_env()

container = client.containers.run(
    "nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc20",
    detach=True,
    remove=True,
    ports={"8000/tcp": 8000},
    ipc_mode="host",
    device_requests=[docker.types.DeviceRequest(count=-1, capabilities=[["gpu"]])],
    ulimits=[
        docker.types.Ulimit(name="memlock", soft=-1, hard=-1),
        docker.types.Ulimit(name="stack", soft=67108864, hard=67108864),
    ],
)

print(container.id)


response = requests.post(
    "http://localhost:8000/v1/chat/completions",
    json={
        "model": "your-model-name",
        "messages": [
            {"role": "user", "content": "Explain transformers in simple terms."}
        ],
        "max_tokens": 256,
        "temperature": 0.7,
    },
)

print(response.json())
