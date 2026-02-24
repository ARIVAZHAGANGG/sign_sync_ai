import cv2
import numpy as np
import os
import sys
import time

# Add backend to path to use HandDetector
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))
from utils import HandDetector

def collect_sequences(label, sequence_length=30, num_sequences=30):
    detector = HandDetector()
    cap = cv2.VideoCapture(0)
    
    # Path for exported data, numpy arrays
    DATA_PATH = os.path.join(os.path.dirname(__file__), "../dataset/sequences")
    if not os.path.exists(DATA_PATH):
        os.makedirs(DATA_PATH)
        
    label_path = os.path.join(DATA_PATH, label)
    if not os.path.exists(label_path):
        os.makedirs(label_path)

    print(f"Starting collection for {label}. You will collect {num_sequences} sequences of {sequence_length} frames each.")
    print("Press 's' to start a sequence collection, 'q' to quit.")

    sequence_count = 0
    while sequence_count < num_sequences:
        success, img = cap.read()
        if not success: break
        
        img, landmarks, bbox = detector.find_hands(img)
        
        cv2.putText(img, f"Label: {label} | Collected: {sequence_count}/{num_sequences}", (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(img, "Press 's' to start sequence", (10, 60), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        cv2.imshow("Data Collection", img)
        
        key = cv2.waitKey(1)
        if key & 0xFF == ord('q'):
            break
        
        if key & 0xFF == ord('s'):
            sequence = []
            print(f"Collecting sequence {sequence_count}...")
            
            # Start collecting frames for the sequence
            frame_num = 0
            while frame_num < sequence_length:
                success, img = cap.read()
                if not success: break
                
                img, landmarks, bbox = detector.find_hands(img)
                
                # If hand detected, add to sequence, else add zeros (or ignore frame)
                if landmarks:
                    # MediaPipe gives 21 landmarks with x,y,z
                    landmarks_flat = detector.get_landmarks_array(landmarks)
                    sequence.append(landmarks_flat)
                    frame_num += 1
                else:
                    # For LSTM, we need consistent frame counts. If no hand, use previous frame or zeros.
                    # Here we wait until a hand is detected to count the frame
                    cv2.putText(img, "Hand NOT detected! Waiting...", (10, 90), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                
                cv2.putText(img, f"RECORDING Sequence {sequence_count}: Frame {frame_num}/{sequence_length}", (10, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                cv2.imshow("Data Collection", img)
                cv2.waitKey(1)

            # Save the sequence
            npy_path = os.path.join(label_path, f"{label}_{sequence_count}.npy")
            np.save(npy_path, np.array(sequence))
            sequence_count += 1
            print(f"Saved {npy_path}")
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python collect_data.py <label>")
    else:
        collect_sequences(sys.argv[1])
