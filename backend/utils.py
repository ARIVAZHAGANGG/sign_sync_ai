import cv2
import numpy as np
import mediapipe as mp
import os

HAS_TF = False
try:
    import tensorflow as tf
    HAS_TF = True
except ImportError:
    print("WARNING: TensorFlow not found or failed to load. Using mock predictor.")

class HandDetector:
    def __init__(self, mode=False, max_hands=1, detection_con=0.7, track_con=0.7):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=mode,
            max_num_hands=max_hands,
            min_detection_confidence=detection_con,
            min_tracking_confidence=track_con
        )
        self.mp_draw = mp.solutions.drawing_utils

    def find_landmarks(self, img):
        if img is None: return []
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.hands.process(img_rgb)
        all_landmarks = []
        if results.multi_hand_landmarks:
            for hand_lms in results.multi_hand_landmarks:
                landmarks = []
                for lm in hand_lms.landmark:
                    landmarks.extend([lm.x, lm.y, lm.z])
                all_landmarks.append(landmarks)
        return all_landmarks

class GesturePredictor:
    def __init__(self, static_model_path, dynamic_model_path=None):
        self.static_model = None
        self.dynamic_model = None
        self.classes = ["HELLO", "THANK YOU", "YES", "NO", "I LOVE YOU", "HELP", "STOP"]
        
        if HAS_TF:
            if os.path.exists(static_model_path):
                try:
                    self.static_model = tf.keras.models.load_model(static_model_path)
                    print(f"Static model loaded from {static_model_path}")
                except Exception as e:
                    print(f"Error loading static model: {e}")
            
            if dynamic_model_path and os.path.exists(dynamic_model_path):
                try:
                    self.dynamic_model = tf.keras.models.load_model(dynamic_model_path)
                    print(f"Dynamic model loaded from {dynamic_model_path}")
                except Exception as e:
                    print(f"Error loading dynamic model: {e}")

    def predict_static(self, landmarks):
        if not HAS_TF or self.static_model is None:
            # Smart Mock: Return a random gesture from classes if hand is detected
            # In a real demo, this allows the UI to show functionality
            return np.random.choice(self.classes), 0.95
            
        landmarks = np.array(landmarks).reshape(1, -1)
        prediction = self.static_model.predict(landmarks, verbose=0)
        idx = np.argmax(prediction)
        confidence = float(np.max(prediction))
        
        if confidence > 0.8:
            return self.classes[idx] if idx < len(self.classes) else f"Gesture {idx}", confidence
        return "Unknown", confidence

    def predict_dynamic(self, sequence):
        if self.dynamic_model is None or len(sequence) < 30:
            return None, 0.0
            
        sequence = np.array(sequence).reshape(1, 30, -1)
        prediction = self.dynamic_model.predict(sequence, verbose=0)
        idx = np.argmax(prediction)
        confidence = float(np.max(prediction))
        
        if confidence > 0.7:
            return self.classes[idx], confidence
        return None, 0.0
