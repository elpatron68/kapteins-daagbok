import React from 'react'

interface PersonSnapshot {
  name: string
  photo?: string | null
  role?: string
}

interface CreatorAvatarProps {
  creatorId?: string
  crewSnapshotsById?: Record<string, PersonSnapshot>
  fallbackName?: string
  size?: number
}

const colors = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#0f766e', // teal
  '#9333ea', // purple
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

export default function CreatorAvatar({
  creatorId,
  crewSnapshotsById,
  fallbackName,
  size = 28
}: CreatorAvatarProps) {
  let name = ''
  let photo: string | null = null
  let role = ''

  if (creatorId && crewSnapshotsById && crewSnapshotsById[creatorId]) {
    const snap = crewSnapshotsById[creatorId]
    name = snap.name || ''
    photo = snap.photo || null
    role = snap.role || ''
  }

  // Fallback to active username if owner or no crew pool matches
  if (!name) {
    if (creatorId === 'skipper') {
      name = fallbackName || localStorage.getItem('active_username') || 'Skipper'
      role = 'skipper'
    } else if (fallbackName) {
      name = fallbackName
    } else if (creatorId) {
      // If creatorId is a username itself (fallback from LiveLogView)
      name = creatorId
    } else {
      name = '?'
    }
  }

  const initial = name ? name.trim().split(/\s+/)[0]?.charAt(0).toUpperCase() || '?' : '?'
  const bgColor = name === '?' ? '#64748b' : getAvatarColor(name)

  const style: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${Math.round(size * 0.45)}px`,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: bgColor,
    flexShrink: 0,
    verticalAlign: 'middle',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxSizing: 'border-box'
  }

  const roleText = role ? (role === 'skipper' ? 'Skipper' : 'Crew') : ''
  const tooltip = name + (roleText ? ` (${roleText})` : '')

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        title={tooltip}
        style={{
          ...style,
          objectFit: 'cover',
          backgroundColor: 'transparent'
        }}
      />
    )
  }

  return (
    <div style={style} title={tooltip} className="creator-avatar-fallback">
      {initial}
    </div>
  )
}
