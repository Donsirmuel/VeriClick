import re
import tldextract
from rest_framework.renderers import JSONRenderer
from rest_framework.parsers import JSONParser


# Built from tldextract's bundled Public Suffix List snapshot. suffix_list_urls=()
# keeps it OFFLINE — the default fetches the list over the network on first use,
# which has no business happening inside a request.
_extract = tldextract.TLDExtract(suffix_list_urls=())


def registrable_domain(host: str) -> str:
    """The domain a customer actually owns.

    `r.donlabs.site` and `donlabs.site` are one registration and count as one
    slot; our own design forces the subdomain, since a redirect cannot live on
    the apex, so charging for both would bill people for following our setup.

    The Public Suffix List is what makes this correct: naive "last two labels"
    would reduce `example.com.ng` to `com.ng` and `example.co.uk` to `co.uk`,
    merging unrelated customers into one slot. It also keeps `example.com` and
    `example.com.ng` distinct, which they are.
    """
    host = (host or '').strip().lower().rstrip('.')
    if not host:
        return ''
    parsed = _extract(host)
    # `top_domain_under_public_suffix` on modern tldextract; `registered_domain`
    # on older releases. Falls back to the raw host for something unparseable
    # (an IP, or a bare label), so a slot is never silently shared.
    return (
        getattr(parsed, 'top_domain_under_public_suffix', '')
        or getattr(parsed, 'registered_domain', '')
        or host
    )


def snake_to_camel(snake: str) -> str:
    parts = snake.split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])


def camel_to_snake(camel: str) -> str:
    s = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', camel)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', s).lower()


def transform_keys(data, converter):
    if isinstance(data, dict):
        return {converter(k): transform_keys(v, converter) for k, v in data.items()}
    if isinstance(data, list):
        return [transform_keys(item, converter) for item in data]
    return data


class CamelCaseJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return super().render(
            transform_keys(data, snake_to_camel),
            accepted_media_type,
            renderer_context,
        )


class CamelCaseJSONParser(JSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        data = super().parse(stream, media_type, parser_context)
        return transform_keys(data, camel_to_snake)


def custom_exception_handler(exc, context):
    from rest_framework.views import exception_handler as drf_exception_handler

    # Handle PermissionError from workspace checks
    if isinstance(exc, PermissionError):
        from rest_framework import status
        from rest_framework.response import Response
        return Response(
            {'errors': [{'detail': str(exc)}]},
            status=status.HTTP_403_FORBIDDEN,
        )

    response = drf_exception_handler(exc, context)
    if response is not None:
        detail = response.data
        if isinstance(detail, dict):
            errors = []
            for field, messages in detail.items():
                if isinstance(messages, list):
                    for msg in messages:
                        errors.append({'field': field, 'detail': str(msg)})
                else:
                    errors.append({'field': field, 'detail': str(messages)})
            response.data = {'errors': errors}
        else:
            response.data = {'errors': [{'detail': str(detail)}]}
    return response
