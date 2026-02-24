try:
    import tensorflow as tf
    print(f"TensorFlow Version: {tf.__version__}")
except Exception as e:
    import traceback
    traceback.print_exc()
