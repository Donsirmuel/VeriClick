from django.contrib import admin
from .models import Workspace, DomainRegistry, TrackingLink, ClickLog

admin.site.register(Workspace)
admin.site.register(DomainRegistry)
admin.site.register(TrackingLink)
admin.site.register(ClickLog)
