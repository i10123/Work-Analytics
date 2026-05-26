import sys
import os
import json
import argparse

# Устанавливаем UTF-8 для корректной передачи кириллицы на Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

try:
    from browser_ai.factory import get_ai_client
except ImportError:
    print(json.dumps({"success": False, "error": "Библиотека majorchik-api не установлена. Запустите pip install majorchik-api"}, ensure_ascii=False))
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Bridge for Node.js to use majorchik-api")
    parser.add_argument("--model", required=True, choices=["deepseek", "google_ai_studio"], help="AI model to use")
    parser.add_argument("--profile-dir", required=True, help="Path to chromium profile directory")
    parser.add_argument("--prompt", required=True, help="Prompt text for AI")
    parser.add_argument("--headless", action="store_true", default=False, help="Run browser in headless mode")
    parser.add_argument("--thinking", action="store_true", default=False, help="Enable DeepThink (for DeepSeek)")
    parser.add_argument("--search", action="store_true", default=False, help="Enable Web Search (for DeepSeek)")
    
    args = parser.parse_args()
    
    ai_client = None
    try:
        # Проверяем, существует ли папка профиля перед запуском (если не режим настройки)
        # majorchik-api бросает исключение ProfileNotFoundError, если папки нет или она пуста
        ai_client = get_ai_client(
            model_name=args.model,
            profile_dir=args.profile_dir,
            headless=args.headless,
            setup_mode=False
        )
        
        kwargs = {}
        if args.model == "deepseek":
            kwargs["thinking"] = args.thinking
            kwargs["web_search"] = args.search
            
        # Запрос к ИИ
        response = ai_client.ask(args.prompt, **kwargs)
        
        # Возвращаем успешный JSON
        print(json.dumps({"success": True, "result": response}, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)
    finally:
        if ai_client:
            try:
                ai_client.close()
            except:
                pass

if __name__ == "__main__":
    main()
