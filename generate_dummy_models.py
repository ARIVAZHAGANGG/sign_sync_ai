import tensorflow as tf
from tensorflow.keras import layers, models
import numpy as np
import os

def create_static_model():
    # My classes: HELLO, THANK YOU, YES, NO, I LOVE YOU, HELP, STOP
    model = models.Sequential([
        layers.Input(shape=(63,)),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(256, activation='relu'),
        layers.Dense(128, activation='relu'),
        layers.Dense(7, activation='softmax')
    ])
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')
    
    # Dummy training to initialize weights
    X = np.random.rand(10, 63)
    y = np.random.randint(0, 7, 10)
    model.fit(X, y, epochs=1, verbose=0)
    return model

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(current_dir, "backend", "model")
    
    if not os.path.exists(model_dir):
        os.makedirs(model_dir)
        
    static = create_static_model()
    static.save(os.path.join(model_dir, "hand_model.h5"))
    print(f"Generated dummy model at {os.path.join(model_dir, 'hand_model.h5')}")
