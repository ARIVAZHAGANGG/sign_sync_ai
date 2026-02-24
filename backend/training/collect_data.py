import cv2
import numpy as np
import os
import sys
# Add parent directory to path to import utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils import HandDetector

# Configuration
DATA_PATH = os.path.join(os.path.dirname(__file__), '../../dataset')
ACTIONS = np.array(['HELLO', 'THANK YOU', 'YES', 'NO', 'I LOVE YOU', 'HELP', 'STOP'])
NO_SEQUENCES = 30
SEQUENCE_LENGTH = 30 # For LSTM if needed

detector = HandDetector(max_hands=1)

def collect_data():
    for action in ACTIONS:
        action_path = os.path.join(DATA_PATH, action)
        if not os.path.exists(action_path):
            os.makedirs(action_path)

        cap = cv2.VideoCapture(0)
        print(f"Collecting data for {action}. Press 's' to start recording current sequence.")
        
        for sequence in range(NO_SEQUENCES):
            for frame_num in range(SEQUENCE_LENGTH):
                ret, frame = cap.read()
                if not ret: break
                
                landmarks = detector.find_landmarks(frame)
                
                # Display status
                cv2.putText(frame, f'Collecting {action} | Seq: {sequence}', (15,30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
                cv2.imshow('OpenCV Feed', frame)

                if landmarks:
                    # Save the first hand's landmarks
                    target_path = os.path.join(action_path, f"{sequence}_{frame_num}.npy")
                    np.save(target_path, landmarks[0])

                if cv2.waitKey(10) & 0xFF == ord('q'):
                    break
            
            print(f"Finished sequence {sequence} for {action}")
            cv2.waitKey(1000) # Short break between sequences

        cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    collect_data()
