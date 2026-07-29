from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Workspace, DomainRegistry, TrackingLink, ClickLog


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ['id', 'name', 'created_at']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )
        return user


class DomainRegistrySerializer(serializers.ModelSerializer):
    links_count = serializers.SerializerMethodField()

    class Meta:
        model = DomainRegistry
        fields = ['id', 'domain', 'health_status', 'last_checked', 'links_count', 'created_at']
        read_only_fields = ['id', 'health_status', 'last_checked', 'links_count', 'created_at']

    def get_links_count(self, obj):
        return obj.links.count()


class TrackingLinkSerializer(serializers.ModelSerializer):
    domain_health = serializers.CharField(
        source='domain.health_status', read_only=True, default=None
    )

    class Meta:
        model = TrackingLink
        fields = [
            'id', 'slug', 'destination_url', 'domain', 'domain_health',
            'total_clicks', 'bot_clicks', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_clicks', 'bot_clicks', 'created_at', 'updated_at']


class ClickLogSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='link.slug', read_only=True)
    time = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = ClickLog
        fields = ['id', 'ip', 'country', 'device', 'reason', 'is_bot', 'slug', 'time', 'created_at']
