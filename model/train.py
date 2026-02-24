import tensorflow as tf
from tensorflow.keras import layers, models
import numpy as np
import os

def create_model(input_shape=(63,)): # 21 landmarks * 3 coords
    model = models.Sequential([
        layers.Input(shape=input_shape),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(5, activation='softmax') # 5 classes: Hello, Stop, Thanks, Yes, No
    ])
    
    model.compile(optimizer='adam',
                  loss='sparse_categorical_crossentropy',
                  metrics=['accuracy'])
    return model

def train_mock_model():
    """Create and save an initial model with random data just to have the file ready."""
    model = create_model()
    # Generate dummy data for 5 classes
    X = np.random.rand(100, 63).astype('float32')
    y = np.random.randint(0, 5, 100)
    
    print("Training initial model...")
    model.fit(X, y, epochs=1, verbose=0)
    
    model_path = os.path.join(os.path.dirname(__file__), "hand_model.h5")
    model.save(model_path)
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train_mock_model()
