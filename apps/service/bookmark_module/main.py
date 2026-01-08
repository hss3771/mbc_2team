from fastapi import FastAPI
from apps.service.bookmark_module.bookmarks import router as bookmarks_router

bookmark_app = FastAPI()
bookmark_app.include_router(bookmarks_router)