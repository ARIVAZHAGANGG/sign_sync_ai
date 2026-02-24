import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, Input
from tensorflow.keras.callbacks import TensorBoard
import numpy as np
import os
from sklearn.model_selection import train_test_split
from tensorflow.keras.utils import to_categorical

# 1. Configuration
DATA_PATH = os.path.join(os.path.dirname(__file__), "../dataset/sequences")
# List actions from dataset folders
actions = np.array([action for action in os.listdir(DATA_PATH) if os.path.isdir(os.path.join(DATA_PATH, action))])
no_sequences = 30
sequence_length = 30
label_map = {label:num for num, label in enumerate(actions)}

# 2. Preprocess Data
sequences, labels = [], []
for action in actions:
    for sequence in range(no_sequences):
        window = []
        for frame_num in range(sequence_length):
            # Load .npy file
            res = np.load(os.path.join(DATA_PATH, action, f"{action}_{sequence}.npy"))
            window.append(res[frame_num])
        sequences.append(window)
        labels.append(label_map[action])

X = np.array(sequences)
y = to_categorical(labels).astype(int)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.05)

# 3. Build LSTM Model
model = Sequential()
model.add(Input(shape=(30, 63))) # 30 frames, 63 landmarks
model.add(LSTM(64, return_sequences=True, activation='relu'))
model.add(LSTM(128, return_sequences=True, activation='relu'))
model.add(LSTM(64, return_sequences=False, activation='relu'))
model.add(Dense(64, activation='relu'))
model.add(Dense(32, activation='relu'))
model.add(Dense(actions.shape[0], activation='softmax'))

model.compile(optimizer='Adam', loss='categorical_crossentropy', metrics=['categorical_accuracy'])

# 4. Train
print(f"Training on {actions}...")
model.fit(X_train, y_train, epochs=200, callbacks=[TensorBoard(log_dir='Logs')])

# 5. Save Model
model_dir = os.path.dirname(__file__)
model.save(os.path.join(model_dir, 'action_model.h5'))
print("Model saved as action_model.h5")
