import Icon from './Icon.jsx';

export default function TierBadge({ tier, style }) {
  const premium = tier === 'premium';
  return (
    <span
      className={`tier${premium ? ' premium' : ''}`}
      style={style}
      title={premium ? 'Premium — Industry Performance Intelligence' : 'Standard — Client Value Transparency'}
    >
      <Icon name={premium ? 'star' : 'shield'} />
      {premium ? 'Premium' : 'Standard'}
    </span>
  );
}
