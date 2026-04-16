#!/bin/bash

ACTION=${1:-get}
RECORD_NAME=$2
NEW_IP=$3

if [ -z "$CLOUDFLARE_API" ] || [ -z "$CLOUDFLARE_ZONE" ]; then
  echo "Error: CLOUDFLARE_API and CLOUDFLARE_ZONE must be set." >&2
  exit 1
fi

if [ "$ACTION" = "get" ]; then
  if [ -n "$RECORD_NAME" ]; then
    curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE/dns_records?type=A&name=$RECORD_NAME" \
         -H "Authorization: Bearer $CLOUDFLARE_API" \
         -H "Content-Type: application/json"
  else
    curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE/dns_records" \
         -H "Authorization: Bearer $CLOUDFLARE_API" \
         -H "Content-Type: application/json"
  fi
elif [ "$ACTION" = "update" ]; then
  if [ -z "$RECORD_NAME" ] || [ -z "$NEW_IP" ]; then
    echo "Error: RECORD_NAME and NEW_IP required for update." >&2
    exit 1
  fi
  
  # Get the Record ID
  RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE/dns_records?type=A&name=$RECORD_NAME" \
       -H "Authorization: Bearer $CLOUDFLARE_API" \
       -H "Content-Type: application/json" | jq -r '.result[0].id')
       
  if [ -z "$RECORD_ID" ] || [ "$RECORD_ID" = "null" ]; then
    echo "Error: Record not found." >&2
    exit 1
  fi

  # Update the Record
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE/dns_records/$RECORD_ID" \
       -H "Authorization: Bearer $CLOUDFLARE_API" \
       -H "Content-Type: application/json" \
       --data "{
         \"type\": \"A\",
         \"name\": \"$RECORD_NAME\",
         \"content\": \"$NEW_IP\",
         \"proxied\": true,
         \"ttl\": 1
       }"
else
  echo "Unknown action: $ACTION" >&2
  exit 1
fi
