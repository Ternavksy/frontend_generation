from typing import List
import time
from googletrans import Translator

class TranslationService:
    def __init__(self):
        self.translator = Translator()

    def translate_list(self, texts: List[str], src_lang: str = 'ru', dest_lang: str = 'en') -> List[str]:
        """
        Переводит список строк.
        :param texts: Список строк для перевода
        :param src_lang: Язык оригинала (например, 'en')
        :param dest_lang: Язык перевода (например, 'ru')
        :return: Список переведённых строк
        """
        if not texts:
            return []

        translated = []
        for text in texts:
            try:
                result = self.translator.translate(text, src=src_lang, dest=dest_lang)
                translated.append(result.text)
                # Небольшая задержка для снижения риска rate-limit от Google
                time.sleep(0.1)
            except Exception as e:
                print(f"Ошибка перевода '{text}': {e}")
                translated.append(text)  # Возвращаем оригинал при ошибке
        return translated

    def translate_split_by_dot(self, text: str, src_lang: str = 'ru', dest_lang: str = 'en') -> List[str]:
        """
        Разбивает строку по точке, переводит каждую часть и возвращает список переводов.
        :param text: Исходная строка
        :param src_lang: Язык оригинала
        :param dest_lang: Язык перевода
        :return: Список переведённых частей
        """
        if not text or not text.strip():
            return []

        # Разбиваем по точке, удаляем пустые элементы и лишние пробелы
        parts = [part.strip() for part in text.split('.') if part.strip()]
        return self.translate_list(parts, src_lang, dest_lang)