from pathlib import Path
import keras

MODEL_DIR = Path(__file__).resolve().parent / "models"

def load_models_local():
    pit_within = keras.saving.load_model(str(MODEL_DIR / "pit_within_k.keras"))
    pit_when = keras.saving.load_model(str(MODEL_DIR / "pit_when_0_to_kminus1.keras"))
    return pit_within, pit_when