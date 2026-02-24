import numpy as np
import os
import tensorflow as tf
from sklearn.model_selection import train_test_split
from tensorflow.keras.utils import to_categorical
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout

# Configuration
DATA_PATH = os.path.join(os.path.dirname(__file__), '../../dataset')
ACTIONS = np.array(['HELLO', 'THANK YOU', 'YES', 'NO', 'I LOVE YOU', 'HELP', 'STOP'])
MODEL_PATH = os.path.join(os.path.dirname(__file__), '../model/hand_model.h5')

label_map = {label:num for num, label in enumerate(ACTIONS)}

def load_data():
    sequences, labels = [], []
    for action in ACTIONS:
        action_dir = os.path.join(DATA_PATH, action)
        if not os.path.exists(action_dir): continue
        
        files = [f for f in os.listdir(action_dir) if f.endswith('.npy')]
        for file in files:
            res = np.load(os.path.join(action_dir, file))
            sequences.append(res)
            labels.append(label_map[action])
            
    return np.array(sequences), to_categorical(labels).astype(int)

def train():
    X, y = load_data()
    if len(X) == 0:
        print("No data found to train on. Run collect_data.py first.")
        return

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1)

    model = Sequential([
        Dense(128, activation='relu', input_shape=(63,)),
        Dropout(0.2),
        Dense(256, activation='relu'),
        Dropout(0.2),
        Dense(128, activation='relu'),
        Dense(ACTIONS.shape[0], activation='softmax')
    ])

    model.compile(optimizer='Adam', loss='categorical_crossentropy', metrics=['categorical_accuracy'])
    
    print("Starting training...")
    model.fit(X_train, y_train, epochs=100, batch_size=32, validation_data=(X_test, y_test))
    
    model.save(MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

if __name__ == "__main__":
    train()
