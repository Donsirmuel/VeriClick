from django.urls import path

from . import views

urlpatterns = [
    path('challenge/', views.challenge_view, name='pow-challenge'),
    path('verify/', views.verify_view, name='pow-verify'),
]
