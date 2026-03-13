from src.backend.config import ApiConfig
from .base import BaseLearningAgent, LLMResponse


SYSTEM_PROMPT = "TO BE DONE"

def load_agent(config : ApiConfig ) -> BaseLearningAgent:
    
    if config.LLM_MODEL.startswith("gemini"):
        from .gemini import GeminiLearningAgent
        return GeminiLearningAgent(SYSTEM_PROMPT, config.LLM_MODEL)
    
    raise NotImplementedError