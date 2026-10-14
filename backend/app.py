import json
import io
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

with open(ROOT / "metadata.json", "r") as f:
    metadata = json.load(f)

CLASSES = metadata["class_names"]

app = FastAPI(title="TerraVision AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class TerraCNN(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 256, 3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1)),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, num_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))


def load_state(model, filename):
    path = ROOT / "models" / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing model checkpoint: {path}")
    state = torch.load(path, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state)
    return model.to(DEVICE).eval()


def build_models():
    result = {}

    cnn = TerraCNN(len(CLASSES))
    result["cnn"] = load_state(cnn, "cnn_best.pth")

    resnet = models.resnet18(weights=None)
    resnet.fc = nn.Linear(resnet.fc.in_features, len(CLASSES))
    result["resnet18"] = load_state(resnet, "resnet18_best.pth")

    vit = models.vit_b_16(weights=None)
    vit.heads.head = nn.Linear(vit.heads.head.in_features, len(CLASSES))
    result["vit_b16"] = load_state(vit, "vit_b16_best.pth")

    return result


MODELS = build_models()

NORMALIZE = transforms.Normalize(
    mean=metadata.get("normalization", {}).get(
        "mean", [0.485, 0.456, 0.406]
    ),
    std=metadata.get("normalization", {}).get(
        "std", [0.229, 0.224, 0.225]
    ),
)

PREPROCESS = {
    "cnn": transforms.Compose([
        transforms.Resize((64, 64)),
        transforms.ToTensor(),
        NORMALIZE,
    ]),
    "resnet18": transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        NORMALIZE,
    ]),
    "vit_b16": transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        NORMALIZE,
    ]),
}

DISPLAY_NAMES = {
    "cnn": "TerraCNN",
    "resnet18": "ResNet18",
    "vit_b16": "Vision Transformer",
}


@app.get("/")
def root():
    return {
        "name": "TerraVision AI",
        "status": "online",
        "models": list(MODELS.keys()),
        "classes": CLASSES,
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "device": str(DEVICE),
        "loaded_models": list(MODELS.keys()),
    }


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    model_name: str = Form("resnet18"),
):
    if model_name not in MODELS:
        raise HTTPException(400, "Unknown model selected.")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image file.")

    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(400, "The uploaded file is not a valid image.")

    tensor = PREPROCESS[model_name](image).unsqueeze(0).to(DEVICE)

    with torch.inference_mode():
        logits = MODELS[model_name](tensor)
        probs = torch.softmax(logits, dim=1)[0]
        values, indices = torch.topk(probs, k=min(3, len(CLASSES)))

    top_predictions = [
        {
            "class_name": CLASSES[int(idx)],
            "confidence": round(float(score) * 100, 2),
        }
        for score, idx in zip(values.cpu(), indices.cpu())
    ]

    return {
        "model": DISPLAY_NAMES[model_name],
        "predicted_class": top_predictions[0]["class_name"],
        "confidence": top_predictions[0]["confidence"],
        "predictions": top_predictions,
        "image_size": {
            "width": image.width,
            "height": image.height,
        },
    }


@app.get("/metrics")
def metrics():
    import csv

    output_dir = ROOT / "outputs"
    json_path = output_dir / "model_comparison.json"
    csv_path = output_dir / "model_comparison.csv"

    def normalize(value):
        if isinstance(value, dict):
            return {k: normalize(v) for k, v in value.items()}
        if isinstance(value, list):
            return [normalize(v) for v in value]
        if isinstance(value, str):
            try:
                return float(value) if value.strip() else value
            except ValueError:
                return value
        return value

    if json_path.exists():
        try:
            data = json.loads(json_path.read_text())
            if isinstance(data, list):
                return normalize(data)
            if isinstance(data, dict):
                for key in ("models", "results", "comparison", "model_comparison"):
                    if isinstance(data.get(key), list):
                        return normalize(data[key])
                if data and all(isinstance(v, dict) for v in data.values()):
                    return [
                        {"model": key, **value}
                        for key, value in data.items()
                    ]
                return [{"name": key, "value": value} for key, value in data.items()]
        except (ValueError, OSError):
            pass

    if csv_path.exists():
        with csv_path.open(newline="", encoding="utf-8") as f:
            return [
                normalize(row)
                for row in csv.DictReader(f)
            ]

    return []
