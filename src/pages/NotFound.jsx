import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

export default function NotFound() {
  return (
    <div className="container">
      <section className="section" style={{ maxWidth: 560 }}>
        <div className="kicker">404</div>
        <h1 className="section-title" style={{ margin: '10px 0' }}>
          We couldn’t find that page
        </h1>
        <Link className="btn btn-dark" to="/">
          <Icon name="arrowLeft" />
          Back to home
        </Link>
      </section>
    </div>
  );
}
