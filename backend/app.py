import os
import numpy as np
import logging
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Enable CORS for all domains to prevent Vercel blocking
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
# ─────────────────────────────────────────────
# Gesture Classes
# ─────────────────────────────────────────────
CLASSES = [
    "HELLO", "THANK YOU", "YES", "NO", "I LOVE YOU", "HELP", "STOP",
    "ONE", "WAIT", "GOOD", "SORRY", "PLEASE", "LITTLE", "PERFECT", "WATER"
]

TAMIL_MAP = {
    "HELLO":     "வணக்கம்",
    "THANK YOU": "நன்றி",
    "YES":       "ஆம்",
    "NO":        "இல்லை",
    "I LOVE YOU":"நான் உன்னை காதலிக்கிறேன்",
    "HELP":      "உதவி",
    "STOP":      "நில்",
    "ONE":       "ஒன்று",
    "WAIT":      "காத்திரு",
    "GOOD":      "நல்லது",
    "SORRY":     "மன்னிக்கவும்",
    "PLEASE":    "தயவுசெய்து",
    "LITTLE":    "கொஞ்சம்",
    "PERFECT":   "மிகவும் நல்லது",
    "WATER":     "தண்ணீர்",
}

# ─────────────────────────────────────────────
# Optional TensorFlow Support
# ─────────────────────────────────────────────
HAS_TF = False
static_model = None

try:
    import tensorflow as tf
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "hand_model.h5")
    if os.path.exists(MODEL_PATH):
        static_model = tf.keras.models.load_model(MODEL_PATH)
        logger.info("TensorFlow model loaded successfully.")
    HAS_TF = True
except Exception as e:
    logger.warning(f"TensorFlow not available ({e}). Using rule-based gesture engine.")

# ─────────────────────────────────────────────
# Rule-Based Gesture Classifier (No TF needed)
# Works purely on MediaPipe landmarks sent from browser
# ─────────────────────────────────────────────
def rule_based_predict(landmarks):
    """
    Improved orientation-agnostic gesture engine.
    Uses distance from wrist to tip vs wrist to pip.
    """
    lm = np.array(landmarks).reshape(21, 3)

    WRIST      = 0
    THUMB_TIP  = 4;  THUMB_IP   = 3;  THUMB_MCP  = 2
    INDEX_TIP  = 8;  INDEX_PIP  = 6
    MIDDLE_TIP = 12; MIDDLE_PIP = 10
    RING_TIP   = 16; RING_PIP   = 14
    PINKY_TIP  = 20; PINKY_PIP  = 18

    def get_dist(p1_idx, p2_idx):
        return np.linalg.norm(lm[p1_idx] - lm[p2_idx])

    # Finger is extended if tip is further from wrist than PIP
    index_up  = get_dist(INDEX_TIP, WRIST)  > get_dist(INDEX_PIP, WRIST)
    middle_up = get_dist(MIDDLE_TIP, WRIST) > get_dist(MIDDLE_PIP, WRIST)
    ring_up   = get_dist(RING_TIP, WRIST)   > get_dist(RING_PIP, WRIST)
    pinky_up  = get_dist(PINKY_TIP, WRIST)  > get_dist(PINKY_PIP, WRIST)
    
    PINKY_MCP = 17
    # Thumb is "up" if its tip is further from pinky base than thumb base is
    thumb_up = get_dist(THUMB_TIP, PINKY_MCP) > get_dist(THUMB_MCP, PINKY_MCP)

    fingers = [index_up, middle_up, ring_up, pinky_up]
    count   = sum(fingers)
    
    # ── Original Signs ──
    if count == 4 and thumb_up:
        return "HELLO", 0.95

    if count == 0 and not thumb_up:
        return "YES", 0.92

    if index_up and middle_up and not ring_up and not pinky_up:
        return "NO", 0.90

    if index_up and pinky_up and not middle_up and not ring_up and thumb_up:
        return "I LOVE YOU", 0.96

    if thumb_up and count == 0:
        return "HELP", 0.88

    # STOP: 4 or 5 fingers open statically
    if count == 4:
        return "STOP", 0.86

    if index_up and middle_up and ring_up and not pinky_up:
        return "THANK YOU", 0.89

    # ── New Signs ──
    # ONE: only index finger up
    if index_up and not middle_up and not ring_up and not pinky_up and not thumb_up:
        return "ONE", 0.91

    # LITTLE: only pinky up
    if pinky_up and not index_up and not middle_up and not ring_up and not thumb_up:
        return "LITTLE", 0.88

    # GOOD: thumb + index only
    if thumb_up and index_up and not middle_up and not ring_up and not pinky_up:
        return "GOOD", 0.90

    # PERFECT: thumb + middle only
    if thumb_up and middle_up and not index_up and not ring_up and not pinky_up:
        return "PERFECT", 0.87

    # SORRY: middle + pinky only
    if middle_up and pinky_up and not index_up and not ring_up:
        return "SORRY", 0.85

    # PLEASE: index + ring + pinky (no middle)
    if index_up and ring_up and pinky_up and not middle_up:
        return "PLEASE", 0.86

    # WAIT: middle + ring + pinky (no index)
    if middle_up and ring_up and pinky_up and not index_up:
        return "WAIT", 0.87

    # WATER: thumb + ring + pinky (no index/middle)
    if thumb_up and ring_up and pinky_up and not index_up and not middle_up:
        return "WATER", 0.84

    return "Unknown", 0.0


def classify(landmarks):
    """Route to TF model if available, else rule-based."""
    rule_gesture, rule_conf = rule_based_predict(landmarks)
    
    # Priority for new/problematic signs explicitly mentioned by user
    FORCE_RULE_SIGNS = [
        "ONE", "WAIT", "GOOD", "SORRY", "PLEASE", "LITTLE", "PERFECT", "WATER",
        "STOP", "THANK YOU"
    ]
    if rule_gesture in FORCE_RULE_SIGNS:
        return rule_gesture, rule_conf

    if HAS_TF and static_model is not None:
        arr = np.array(landmarks).reshape(1, -1)
        pred = static_model.predict(arr, verbose=0)[0]
        idx = int(np.argmax(pred))
        conf = float(np.max(pred))
        if conf > 0.78 and idx < len(CLASSES):
            return CLASSES[idx], conf
            
    if rule_gesture != "Unknown":
        return rule_gesture, rule_conf
        
    return "Unknown", 0.0


# ─────────────────────────────────────────────
# State
# ─────────────────────────────────────────────
history = []
current_sentence = []
last_gesture = None
repeat_count  = 0


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "online",
        "engine": "TensorFlow" if HAS_TF else "Rule-Based",
        "classes": CLASSES
    })


@app.route('/predict', methods=['POST'])
def predict():
    global last_gesture, repeat_count, current_sentence, history

    data = request.json or {}
    multi_landmarks = data.get('multi_landmarks', [])
    # Support old 'landmarks' key for backward compatibility
    single_landmarks = data.get('landmarks')
    if not multi_landmarks and single_landmarks:
        multi_landmarks = [single_landmarks]
    
    lang = data.get('lang', 'en')

    if not multi_landmarks:
        return jsonify({
            "detections": [],
            "gesture": "No Hand",
            "confidence": 0,
            "sentence": " ".join(current_sentence),
            "history": history[-10:]
        })

    detections = []
    best_gesture = "Unknown"
    max_conf = 0

    for landmarks in multi_landmarks:
        flat = np.array(landmarks).flatten().tolist()
        gesture, confidence = classify(flat)
        display_gesture = TAMIL_MAP.get(gesture, gesture) if lang == 'ta' else gesture
        
        detections.append({
            "gesture": display_gesture,
            "confidence": confidence
        })
        
        if confidence > max_conf:
            max_conf = confidence
            best_gesture = gesture

    logger.info(f"Detections: {detections}")
    # ── Sentence Builder with debounce (using the best detection) ──
    if best_gesture not in ("Unknown", "No Hand") and max_conf > 0.75:
        if best_gesture == last_gesture:
            repeat_count += 1
        else:
            last_gesture = best_gesture
            repeat_count = 0

        if repeat_count == 4:          # ~4 frames hold = confirmed sign (fast)
            display = TAMIL_MAP.get(best_gesture, best_gesture) if lang == 'ta' else best_gesture
            if not current_sentence or current_sentence[-1] != display:
                current_sentence.append(display)
                history.append({"text": display, "time": "Just now"})
                if len(current_sentence) > 10:
                    current_sentence.pop(0)

    primary_display = TAMIL_MAP.get(best_gesture, best_gesture) if lang == 'ta' else best_gesture

    return jsonify({
        "detections": detections,
        "gesture":    primary_display,
        "confidence": max_conf,
        "sentence":   " ".join(current_sentence),
        "history":    history[-10:]
    })


@app.route('/speak', methods=['POST'])
def speak():
    data = request.json or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({"error": "No text"}), 400

    def _speak(t):
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.say(t)
            engine.runAndWait()
        except Exception as e:
            logger.error(f"TTS error: {e}")

    # Run in background thread so Flask doesn't block
    threading.Thread(target=_speak, args=(text,), daemon=True).start()
    return jsonify({"status": "speaking"})


@app.route('/capture', methods=['POST'])
def capture():
    """Accept a single hand landmark sample and save it for training."""
    data     = request.json or {}
    label    = (data.get('label') or '').strip().upper()
    landmarks = data.get('landmarks')   # list of 21 [x,y,z]

    if not label:
        return jsonify({"error": "label required"}), 400
    if not landmarks or len(landmarks) != 21:
        return jsonify({"error": "21 landmarks required"}), 400

    # --- persist to dataset/<LABEL>/ ---
    dataset_dir = os.path.join(os.path.dirname(__file__), '..', 'dataset', label)
    os.makedirs(dataset_dir, exist_ok=True)

    # count existing samples to generate the next index
    existing = [f for f in os.listdir(dataset_dir) if f.endswith('.npy')]
    idx      = len(existing)

    flat_lm = np.array(landmarks).flatten()   # shape (63,)
    save_path = os.path.join(dataset_dir, f"{idx}.npy")
    np.save(save_path, flat_lm)

    logger.info(f"Saved sample {idx} for gesture '{label}'")
    return jsonify({"status": "saved", "label": label, "sample_index": idx, "total": idx + 1})


@app.route('/list_gestures', methods=['GET'])
def list_gestures():
    """Return all known gestures (built-in + trained)."""
    dataset_root = os.path.join(os.path.dirname(__file__), '..', 'dataset')
    trained = []
    if os.path.exists(dataset_root):
        trained = [d for d in os.listdir(dataset_root) if os.path.isdir(os.path.join(dataset_root, d))]
    all_gestures = list(set(CLASSES + trained))
    return jsonify({"gestures": sorted(all_gestures)})


@app.route('/reset', methods=['POST'])
def reset():
    global current_sentence, history, last_gesture, repeat_count
    current_sentence = []
    history          = []
    last_gesture     = None
    repeat_count     = 0
    return jsonify({"status": "reset"})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting SignSync AI Backend on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
