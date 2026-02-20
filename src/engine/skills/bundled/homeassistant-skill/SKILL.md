---
name: homeassistant-skill
description: Control Home Assistant devices and automations via REST API. Lights, climate, locks, presence, weather, calendars, notifications, scripts, and more.
---
# Home Assistant Skill

Control smart home devices via the Home Assistant REST API.

## Setup

Set environment variables:
- `HA_URL` — Your Home Assistant URL (e.g., `http://10.0.0.10:8123`)
- `HA_TOKEN` — Long-lived access token (create in HA > Profile > Long-Lived Access Tokens)

## Safety Rules

**Always confirm with the user before:**
- **Locks** — locking or unlocking any lock
- **Alarm panels** — arming or disarming
- **Garage doors** — opening or closing (`cover.*` with `device_class: garage`)
- **Security automations** — disabling automations related to security or safety

## Entity Discovery

### List all entities
```bash
curl -s "$HA_URL/api/states" -H "Authorization: Bearer $HA_TOKEN" \
  | jq -r '.[].entity_id' | sort
```

### List by domain
```bash
curl -s "$HA_URL/api/states" -H "Authorization: Bearer $HA_TOKEN" \
  | jq -r '.[] | select(.entity_id | startswith("light.")) | "\(.entity_id): \(.state)"'
```

### Get single entity
```bash
curl -s "$HA_URL/api/states/ENTITY_ID" -H "Authorization: Bearer $HA_TOKEN"
```

## Common Operations

### Switches
```bash
curl -s -X POST "$HA_URL/api/services/switch/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "switch.office_lamp"}'
```

### Lights
```bash
# Turn on with brightness
curl -s -X POST "$HA_URL/api/services/light/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room", "brightness_pct": 80}'

# With color
curl -s -X POST "$HA_URL/api/services/light/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room", "rgb_color": [255, 150, 50]}'
```

### Climate
```bash
curl -s -X POST "$HA_URL/api/services/climate/set_temperature" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "climate.thermostat", "temperature": 72}'
```

### Scenes
```bash
curl -s -X POST "$HA_URL/api/services/scene/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "scene.movie_time"}'
```

### Automations
```bash
# Trigger
curl -s -X POST "$HA_URL/api/services/automation/trigger" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "automation.morning_routine"}'

# Enable/disable
curl -s -X POST "$HA_URL/api/services/automation/turn_on" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "automation.morning_routine"}'
```

### Locks (confirm with user first!)
```bash
curl -s -X POST "$HA_URL/api/services/lock/lock" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "lock.front_door"}'
```

### Notifications
```bash
curl -s -X POST "$HA_URL/api/services/notify/mobile_app_phone" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"message": "Front door opened", "title": "Home Alert"}'
```

### Presence
```bash
curl -s "$HA_URL/api/states" -H "Authorization: Bearer $HA_TOKEN" \
  | jq -r '.[] | select(.entity_id | startswith("person.")) | "\(.attributes.friendly_name // .entity_id): \(.state)"'
```

## General Pattern

```bash
curl -s -X POST "$HA_URL/api/services/{domain}/{service}" \
  -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "domain.entity_name"}'
```

## Entity Domains

`switch.*`, `light.*`, `scene.*`, `script.*`, `automation.*`, `climate.*`, `cover.*`, `lock.*`, `fan.*`, `media_player.*`, `vacuum.*`, `alarm_control_panel.*`, `notify.*`, `person.*`, `device_tracker.*`, `weather.*`, `calendar.*`, `sensor.*`, `binary_sensor.*`, `input_boolean.*`, `input_number.*`, `input_select.*`

## Notes

- API returns JSON by default
- Long-lived tokens don't expire — store securely
- Test entity IDs with the list command first
- For locks, alarms, and garage doors — always confirm actions with the user
- Requires `curl` and `jq`
