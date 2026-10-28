import { Link } from 'react-router-dom';
import { SHOP } from './config';
import { tr, useLanguage, Brand, LanguageSelector } from './language.jsx';
import { useAuth } from './context';
import wixPages from './wix-content.json';
import Icon from './icons';
import { NotificationBell } from './notifications.jsx';
import { ProfileMenu } from './profile.jsx';
import './business.css';

export function ShopDetails() {
  return <address className="shop-details">
    <p><Icon name="pin" size={19} /><span>{tr(SHOP.address)}</span></p>
    {[SHOP.phone, SHOP.alternatePhone].map(phone => <a key={phone} href={'tel:' + phone.replace(/\s/g, '')}>{phone}</a>)}
    <a href={'mailto:' + SHOP.email}>{SHOP.email}</a>
    <p>{tr(SHOP.hours)}</p>
  </address>;
}

const reasons = [
  ['home-5.png', 'Quality Agro Products', 'At Raiyani Agro Seeds, quality is our top priority. We provide a wide range of agro products and agricultural equipment using sustainable practices to ensure the best results. From quality seeds to modern farming equipment, every product is carefully selected for peak performance.'],
  ['home-6.jpg', 'Customer Education', 'Our business aims to educate and guide our customers in making informed choices about agro products and modern farming equipment. We provide expert support and resources to help our customers achieve their agricultural goals.'],
  ['home-7.jpg', 'Complete Agro Solutions', 'We offer a complete range of agro products, quality seeds, and modern agricultural equipment to provide a one-stop solution for all farming needs. Our products are designed to promote sustainable and efficient farming practices for hobbyists and professional farmers alike.'],
];

export function WhyChooseUs() {
  return <section className="section"><div className="section-head"><div><span className="eyebrow">{tr('GROW WITH RAS')}</span><h2>{tr('Why choose Raiyani Agro Seeds?')}</h2></div></div>
    <p className="wix-section-intro">{tr('We are committed to providing the highest quality agro products and agricultural equipment to our customers. Our dedication to quality ensures that every purchase meets the highest standards.')}</p>
    <div className="business-values wix-photo-values">{reasons.map(([photo, title, text]) => <article key={title}><Photo file={photo} alt={title} /><div><h3>{tr(title)}</h3><p>{tr(text)}</p></div></article>)}</div>
  </section>;
}

export function FAQs() {
  const source = getPage('q-a-contact-us').text.split('\n').map(text => text.trim()).filter(Boolean).slice(1);
  return <section className="section business-faq" id="faq"><span className="eyebrow">{tr('HERE TO HELP')}</span><h2>{tr('Frequently asked questions')}</h2>
    {source.map((block, index) => {
      return <details key={block}><summary>{tr(block)}</summary><p>{tr(source[index + 1])}</p></details>;
    }).filter((_, index) => index % 2 === 0)}
  </section>;
}

export function About() {
  return <>
    <PageHeading title="About Raiyani Agro Seeds" subtitle="A family business. A shared passion for growing." />
    <PageLinks />
    <WixIntroduction />
    <WhyChooseUs />
    <StoryCards />
    <GrowTogether />
  </>;
}

const getPage = slug => wixPages.find(page => page.slug === slug);
function paragraphs(slug) {
  return getPage(slug).text.split(/\n\s*\n/).map(text => text.replace(/\u200b/g, '').trim()).filter(Boolean);
}
function Photo({ file, alt, ...props }) {
  return <img src={'/assets/wix/' + file} alt={tr(alt)} loading="lazy" decoding="async" {...props} />;
}
function PageHeading({ title, subtitle }) {
  return <div className="page-heading"><span className="eyebrow">{tr('GROW SOMETHING REAL')}</span><h1>{tr(title)}</h1>{subtitle && <p>{tr(subtitle)}</p>}</div>;
}
function PageLinks() {
  return <nav className="wix-page-links" aria-label={tr('Explore RAS')}><Link to="/about">{tr('About us')}</Link><Link to="/our-story">{tr('Our story')}</Link><Link to="/our-team">{tr('Our team')}</Link><Link to="/products">{tr('Our Products')}</Link><Link to="/blog">{tr('Blog')}</Link><Link to="/contact">{tr('Contact us')}</Link></nav>;
}
function GrowTogether() {
  return <section className="about-banner"><span className="eyebrow">{tr('GROW SOMETHING REAL')}</span><h2>{tr('Let’s grow together.')}</h2><p>{tr('Visit our shop, ask a question or explore our products for your next season.')}</p><div className="hero-actions"><Link className="btn light" to="/shop">{tr('All products')}</Link><Link className="text-link" to="/contact">{tr('Contact us')}</Link></div></section>;
}
export function WixIntroduction() {
  const text = getPage('home').richText;
  return <section className="section wix-introduction"><div className="wix-intro-top"><div><span className="eyebrow">{tr('WELCOME TO RAS')}</span><h2>{tr(text[0])}</h2><p>{tr(text[1])}</p><Link className="btn" to="/contact">{tr('Contact us')} <Icon name="arrow" size={18} /></Link></div><Photo file="home-1.png" alt="Raiyani Agro Seeds agricultural products" /></div>
    <div className="wix-about-row"><Photo file="home-3.jpg" alt="Organic Tomatoes" /><div><h2>{tr('About Raiyani Agro Seeds')}</h2><p>{tr(text[3])}</p><Link className="text-link" to="/contact">{tr('Get in Touch')} →</Link></div></div>
    <div className="wix-farm-strip"><Photo file="home-2.jpg" alt="Green farm landscape" /><div>{tr('GROW SOMETHING REAL')}</div><Photo file="home-4.jpg" alt="Growing with nature" /></div>
  </section>;
}
export function Story() {
  return <><PageHeading title="Our story" subtitle="A family business. A shared passion for growing." /><PageLinks /><section className="wix-story-layout"><Photo file="our-story-1.jpg" alt="The Raiyani Agro Seeds story" /><div>{paragraphs('our-story').slice(1).map(text => <p key={text}>{tr(text)}</p>)}</div></section><GrowTogether /></>;
}
export function Team() {
  const text = paragraphs('our-team');
  const details = getPage('our-team').richText;
  return <><PageHeading title="The People Behind RAS" /><PageLinks /><section className="wix-team-intro">{text.slice(1).map(block => <p key={block}>{tr(block)}</p>)}</section><div className="wix-team-gallery">{getPage('our-team').images.map((image, index) => {
    const [role, name, description] = details.slice(1 + index * 3, 4 + index * 3);
    const [bio, phone] = description.split(/\n\s*\n/).filter(Boolean);
    return <article key={image.local}><img src={image.local} alt={tr(name)} loading="lazy" decoding="async" /><div><span className="eyebrow">{tr(role)}</span><h2>{tr(name)}</h2><p>{tr(bio)}</p>{phone && <a href={'tel:+91' + phone}>{phone}</a>}</div></article>;
  })}</div><GrowTogether /></>;
}
export function ProductIntroduction() {
  const categories = ['Pesticides', 'Seeds', 'Tools', 'Fertilizers'];
  const details = getPage('products').richText;
  return <section className="wix-product-intro"><h2>{tr('Our Products')}</h2><p>{tr(details[1])}</p><div className="wix-product-gallery">{getPage('products').images.map((image, index) => <Link key={image.local} to={'/shop?category=' + categories[index]}><img src={image.local} alt={tr(details[2 + index * 2])} loading="lazy" decoding="async" /><span>{tr(details[2 + index * 2])} <Icon name="arrow" size={16} /></span><p>{tr(details[3 + index * 2])}</p></Link>)}</div></section>;
}
const articleSlug = '/post/gardening-solutions-seeds-pesticides-and-equipment-online';
const articleTitle = 'Gardening Solutions: Seeds, Pesticides, and Equipment Online';
const articleHeadings = ['The Importance of Quality Seeds', 'Pesticides: Protecting Your Plants', 'Essential Gardening Equipment', 'Online Shopping for Gardening Supplies', 'Tips for Successful Gardening', 'The Future of Gardening', 'Final Thoughts'];
export function Blog() {
  return <><PageHeading title="Blog" subtitle="Gardening, growing and ideas from RAS." /><PageLinks /><article className="wix-blog-card"><Link to={articleSlug}><Photo file="products-4.png" alt="A gardener planting seeds in a well-prepared garden bed." /><div><span className="eyebrow">{tr('July 11, 2025')} · {tr('4 min read')}</span><h2>{tr(articleTitle)}</h2><p>{tr(paragraphs(articleSlug.slice(1)).find(block => block.startsWith('Gardening is more than')))}</p><span className="text-link">{tr('Read article')} →</span></div></Link></article></>;
}
export function BlogPost() {
  const blocks = paragraphs(articleSlug.slice(1)).slice(1).filter(text => text !== 'A gardener planting seeds in a well-prepared garden bed.' && !text.startsWith('Updated:'));
  return <><div className="breadcrumbs"><Link to="/blog">{tr('All Posts')}</Link><span>/</span><span>{tr('Gardening')}</span></div><article className="wix-article"><header><span className="eyebrow">enquiresraiyaniagr · {tr('July 11, 2025')} · {tr('4 min read')}</span><h1>{tr(articleTitle)}</h1><p className="muted">{tr('Updated: July 12, 2025')}</p></header>{blocks.map(text => articleHeadings.includes(text) ? <h2 key={text}>{tr(text)}</h2> : <p key={text}>{tr(text)}</p>)}<figure><Photo file="products-4.png" alt="Close-up view of a gardener planting seeds in rich soil" /><figcaption>{tr('A gardener planting seeds in a well-prepared garden bed.')}</figcaption></figure><Link className="btn" to="/shop">{tr('Shop farm essentials')} <Icon name="arrow" size={18} /></Link></article></>;
}
export function Welcome() {
  useLanguage();
  const { user } = useAuth();
  return <div className="cover-page">
    <section className="cover-scene" aria-labelledby="cover-title">
      <img className="cover-landscape" src="/assets/farm-sunrise.png" alt={tr('Green farm landscape')} loading="eager" />
      <header className="cover-header"><Link to="/" aria-label={tr(SHOP.name)}><Brand /></Link><div><LanguageSelector /><NotificationBell /><ProfileMenu /><Link className="cover-enter" to="/home">{tr(user ? 'Enter the shop' : 'Sign in')}<Icon name="arrow" size={17} /></Link></div></header>
      <div className="cover-copy"><span className="cover-eyebrow">{tr('FROM OUR FAMILY. FOR YOUR FIELDS.')}</span><h1 id="cover-title">{tr('Rooted in nature.')}<br /><em>{tr('Grown with care.')}</em></h1><p>{tr('Good seeds. Honest guidance. A little care for everything you grow.')}</p><div className="cover-actions"><Link className="btn" to="/home">{tr('Explore our shop')}<Icon name="arrow" size={19} /></Link><a href="#discover-ras">{tr('Discover RAS')}<span>↗</span></a></div><span className="cover-family-note"><Icon name="leaf" size={17} />{tr('A family business. A shared passion for growing.')}</span></div>
      <div className="cover-bottom"><span><Icon name="pin" size={15} />{tr(SHOP.city)}</span><span>{tr('SEEDS · SOIL · GROWTH')}</span><a href="#discover-ras">{tr('Our roots, our people')}<span aria-hidden="true">↓</span></a></div>
    </section>
    <section className="cover-discover" id="discover-ras"><div className="cover-discover-heading"><span className="eyebrow">{tr('THE HEART OF RAS')}</span><h2>{tr('A local beginning.')}<br /><em>{tr('A growing story.')}</em></h2><p>{tr('Meet the family and the place behind every seed we share.')}</p></div><StoryCards /></section>
    <footer className="cover-footer"><span>{tr(SHOP.name)} · {tr(SHOP.city)}</span><a href={SHOP.mapsUrl} target="_blank" rel="noreferrer">{tr('Visit our shop')} ↗</a><Link to="/privacy">{tr('Privacy policy')}</Link><span>{tr(SHOP.hours)}</span></footer>
  </div>;
}

function StoryCards() {
  return <div className="ras-story-cards section"><Link to="/our-story" className="ras-story-card"><img src="/assets/wix/our-story-1.jpg" alt={tr('The Raiyani Agro Seeds story')} loading="lazy" /><div className="ras-story-card-copy"><span>{tr('01 / OUR ROOTS')}</span><h2>{tr('Our story')}</h2><p>{tr('Read our story')}<Icon name="arrow" size={21} /></p></div></Link><Link to="/our-team" className="ras-story-card"><div className="ras-team-mosaic">{[1,2,4].map(index => <img key={index} src={'/assets/wix/our-team-' + index + '.jpg'} alt={tr('The Raiyani family')} loading="lazy" />)}</div><div className="ras-story-card-copy"><span>{tr('02 / OUR PEOPLE')}</span><h2>{tr('The People Behind RAS')}</h2><p>{tr('Meet our team')}<Icon name="arrow" size={21} /></p></div></Link></div>;
}
