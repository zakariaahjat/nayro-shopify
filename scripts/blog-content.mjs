// Blog content used by scripts/seed-blog.mjs.
// Each post is created as a real Shopify article through the Admin API.
// Images live in assets/blog-demo-*.png and are uploaded by the seeder.

export const posts = [
  {
    title: 'How to buy a refurbished phone with confidence',
    handle: 'buy-refurbished-phone-confidence',
    summary: 'Our checklist to buy refurbished tech safely, from condition grades to warranty and returns.',
    tags: ['Buying guide', 'Refurbished', 'Phones'],
    publishDate: '2026-01-05T10:00:00Z',
    image: 1,
    imageAlt: 'Illustration of a refurbished smartphone with a verification check',
    body: `
      <p>Buying refurbished is the smart way to save up to 60% on a phone that still has plenty of life left. The trick is knowing what to check before you pay.</p>
      <p>At Nayro, every refurbished device is inspected, graded and described honestly. Use this checklist whether you buy from us or anywhere else.</p>
      <h2>1. Understand the condition grade</h2>
      <p>A grade is not a secret code. It should tell you exactly what to expect:</p>
      <ul>
        <li><strong>Excellent:</strong> almost no signs of use, screen and body in great shape.</li>
        <li><strong>Very good:</strong> light scratches that are hard to see with a case on.</li>
        <li><strong>Good:</strong> visible marks, but fully functional.</li>
      </ul>
      <p>Ask for real photos of the exact unit, not a generic stock image.</p>
      <h2>2. Check the battery health</h2>
      <p>Battery health is the most important number on a used phone. Look for 85% or higher. Below 80%, you will probably need a replacement soon, which changes the value of the deal.</p>
      <h2>3. Confirm the warranty</h2>
      <p>A serious seller offers a written warranty. It should cover hardware defects for a clear period, usually 3 to 12 months. “No returns” on a refurbished phone is a warning sign.</p>
      <h2>4. Verify the IMEI</h2>
      <p>Ask for the IMEI and check that the phone is not reported lost or stolen. The IMEI should match the number in the settings and on the box.</p>
      <h2>5. Test the essentials</h2>
      <ul>
        <li>Touch every part of the screen and check for dead spots.</li>
        <li>Take a photo with each camera and record a short video with sound.</li>
        <li>Test the speaker, microphone, charging port and both SIM slots.</li>
        <li>Connect to Wi-Fi and Bluetooth.</li>
        <li>Check Face ID or the fingerprint sensor.</li>
      </ul>
      <h2>6. Read the return policy</h2>
      <p>You should have time to test the phone at home. A 7-day return window is a good standard. Check who pays for return shipping and what condition the phone must be in.</p>
      <blockquote>A good refurbished deal is not the cheapest phone. It is the phone with the clearest condition report, a real warranty and a return policy you can use.</blockquote>
      <h2>Red flags to avoid</h2>
      <ul>
        <li>The seller refuses to share photos or the IMEI.</li>
        <li>The price is far below the market and the story feels rushed.</li>
        <li>There is no warranty or return policy in writing.</li>
        <li>The phone is “new” but the seal is broken and there is no receipt.</li>
      </ul>
      <p>Ready to upgrade? <a href="/collections/all">Browse our checked refurbished phones</a> and compare condition, battery health and warranty before you decide.</p>
    `,
  },
  {
    title: 'Cash on delivery: how it works in Morocco',
    handle: 'cash-on-delivery-morocco',
    summary: 'Pay when you receive your order, everywhere in Morocco. Here is the full process.',
    tags: ['Delivery', 'Payment', 'Morocco'],
    publishDate: '2026-01-08T10:00:00Z',
    image: 2,
    imageAlt: 'Illustration of a delivery box and a coin for cash on delivery',
    body: `
      <p>Cash on delivery is simple: you order online, we deliver to your door, and you pay when the package arrives. No card, no online payment, no surprises.</p>
      <h2>Step 1: Place your order</h2>
      <p>Add your items to the cart and enter your full address, phone number and city. Double-check the phone number. The delivery team will use it to confirm your order and agree on a delivery time.</p>
      <h2>Step 2: Confirmation call</h2>
      <p>Most orders are confirmed by phone or WhatsApp within a few hours. If we cannot reach you, the order may be delayed or cancelled. Keep your phone nearby after ordering.</p>
      <h2>Step 3: Delivery</h2>
      <p>Delivery times depend on your city:</p>
      <ul>
        <li><strong>Casablanca, Rabat, Marrakech, Tangier:</strong> usually 24 to 48 hours.</li>
        <li><strong>Other major cities:</strong> usually 2 to 4 working days.</li>
        <li><strong>Smaller towns and rural areas:</strong> usually 3 to 6 working days.</li>
      </ul>
      <p>You will receive a call before the courier arrives.</p>
      <h2>Step 4: Inspect before you pay</h2>
      <p>Ask to open the package before paying. Check that the item matches the description, that all accessories are included and that the device powers on. If something is wrong, do not accept the delivery. Contact us and we will fix it.</p>
      <h2>Step 5: Pay the courier</h2>
      <p>Pay the exact amount shown on the order confirmation. The courier may not carry enough change, so prepare cash if possible. You will receive a receipt.</p>
      <h2>What if I need to return an item?</h2>
      <p>You have 7 days from delivery to request a return if the item does not match its description. Keep the packaging and all accessories. We will arrange the return and issue a refund or exchange according to our policy.</p>
      <blockquote>Cash on delivery is available across Morocco. If your area is not covered, contact us and we will find the closest delivery point.</blockquote>
      <h2>Questions?</h2>
      <p>Send us a message on WhatsApp before you order if you are unsure about the delivery time or the product. We would rather answer a question than have you wait for a package that is not right.</p>
    `,
  },
  {
    title: '5 tips to sell your used items faster',
    handle: 'sell-used-items-faster',
    summary: 'Practical tips to sell your second-hand items quickly and at a fair price.',
    tags: ['Selling', 'Tips', 'Used'],
    publishDate: '2026-01-12T10:00:00Z',
    image: 3,
    imageAlt: 'Illustration of a price tag with an upward arrow',
    body: `
      <p>Selling a used phone, laptop or accessory is easier when the listing answers the questions buyers already have. These five tips will help you sell faster and avoid endless messages.</p>
      <h2>1. Take clear photos in good light</h2>
      <p>Use daylight, a clean background and at least six photos: front, back, both sides, the screen turned on and any damage. Buyers trust listings that show the real item, including the flaws.</p>
      <h2>2. Write an honest description</h2>
      <p>Include the exact model, storage, color, battery health, condition and what is included. Mention scratches, dents or replaced parts. Honesty saves time and prevents returns.</p>
      <h2>3. Price with evidence</h2>
      <p>Check completed listings for the same model and condition. Price slightly below the average if you want a fast sale, but do not go so low that buyers assume something is wrong.</p>
      <h2>4. Include the original accessories</h2>
      <p>Box, charger, cable, case and receipt add real value. A complete package is easier to trust and often sells for more than a bare device.</p>
      <h2>5. Reply quickly and meet safely</h2>
      <p>Fast replies win sales. Answer questions directly, send extra photos if asked and agree on a safe public place for the handover. For shipping, use a tracked service and keep proof of postage.</p>
      <blockquote>Before you list, reset the device and remove your accounts. A buyer should be able to set it up from scratch.</blockquote>
      <h2>Bonus: know when to trade in</h2>
      <p>If you do not want to manage messages and meetups, a trade-in or buy-back service can be faster. Compare the offer with the effort of selling privately and choose what works for you.</p>
      <p>Have tech to sell? <a href="/pages/sell">Tell us what you have</a> and our team will get back to you with an offer.</p>
    `,
  },
  {
    title: 'New vs refurbished laptops: which should you buy?',
    handle: 'new-vs-refurbished-laptops',
    summary: 'A practical comparison of price, performance, warranty and battery life before you choose your next laptop.',
    tags: ['Buying guide', 'Laptops', 'Refurbished'],
    publishDate: '2026-01-16T10:00:00Z',
    image: 4,
    imageAlt: 'Illustration comparing a new laptop and a refurbished laptop',
    body: `
      <p>A new laptop is not automatically the right choice. A well-checked refurbished model can offer the same performance for much less, as long as you know what you are buying.</p>
      <h2>Price</h2>
      <p>This is the obvious difference. Refurbished laptops often cost 30% to 50% less than new ones. That saving can go toward more RAM, a larger SSD or a better warranty.</p>
      <h2>Performance</h2>
      <p>A two-year-old premium laptop usually outperforms a new entry-level model at the same price. Look at the processor generation, RAM and storage instead of the age alone.</p>
      <h2>Battery life</h2>
      <p>Battery is the main Wear item. Ask for battery health or cycle count. If the battery is below 80%, factor in the cost of a replacement before you compare prices.</p>
      <h2>Warranty and returns</h2>
      <p>New laptops come with a manufacturer warranty. Refurbished laptops should come with a seller warranty. Read what is covered, how long it lasts and who pays for shipping.</p>
      <h2>Condition</h2>
      <p>Refurbished does not mean damaged. A good seller grades the condition and shows real photos. Cosmetic marks are normal on a used laptop, but the screen, keyboard, ports and hinge should all work perfectly.</p>
      <h2>Sustainability</h2>
      <p>Keeping a working laptop in use is better for the environment than buying new. It also saves you money. Both things can be true at once.</p>
      <blockquote>Buy refurbished for the value, not because it is cheap. Check the specs, battery, warranty and return policy, then compare the total cost.</blockquote>
      <h2>Our recommendation</h2>
      <ul>
        <li><strong>Choose new</strong> if you need the latest model, the longest battery life and a full manufacturer warranty.</li>
        <li><strong>Choose refurbished</strong> if you want premium specs on a budget and you are comfortable checking the condition report.</li>
      </ul>
      <p>Browse our <a href="/collections/all">available laptops</a> and compare the specs, condition and warranty on each listing.</p>
    `,
  },
  {
    title: 'How to check a used phone before buying',
    handle: 'check-used-phone-before-buying',
    summary: 'A 10-minute test that catches most problems before you hand over your money.',
    tags: ['Buying guide', 'Phones', 'Used'],
    publishDate: '2026-01-20T10:00:00Z',
    image: 5,
    imageAlt: 'Illustration of a phone next to a checklist',
    body: `
      <p>Ten minutes of testing can save you from a phone that looks perfect but fails a week later. Use this checklist when you buy a used phone in person.</p>
      <h2>Before the meeting</h2>
      <ul>
        <li>Ask for the exact model, storage and IMEI.</li>
        <li>Confirm the price and what is included.</li>
        <li>Ask whether the phone has been repaired or opened.</li>
      </ul>
      <h2>At the meeting</h2>
      <h3>1. Check the outside</h3>
      <p>Look at the corners, camera glass and screen edges. A case can hide cracks, so remove it. Check that the buttons and charging port are not loose.</p>
      <h3>2. Test the screen</h3>
      <p>Open a white image and a dark image. Look for spots, lines or discoloration. Drag an icon across every part of the screen to find dead zones.</p>
      <h3>3. Test the battery</h3>
      <p>Open the battery settings and check health if available. A phone that drops several percent in a few minutes is a problem.</p>
      <h3>4. Test the cameras</h3>
      <p>Take photos with every lens, switch to video, record with sound and test the front camera. Check that the lenses are clean and not cracked.</p>
      <h3>5. Test sound and sensors</h3>
      <p>Play a video at full volume, make a call, test the microphone, Wi-Fi, Bluetooth, GPS and Face ID or fingerprint unlock.</p>
      <h3>6. Check the IMEI</h3>
      <p>Dial the IMEI code and compare it with the number on the box and the listing. Ask the seller to remove their accounts and reset the phone in front of you.</p>
      <h3>7. Check water damage</h3>
      <p>If the phone has a removable SIM tray, look for the water indicator. On newer phones, ask about repairs and check for condensation under the camera glass.</p>
      <blockquote>If the seller rushes you or refuses a basic test, walk away. There are other phones.</blockquote>
      <h2>After the purchase</h2>
      <p>Keep the receipt, warranty and chat history. Test the phone again at home, and contact the seller immediately if something does not match the description.</p>
      <p>Prefer a phone that has already been checked? <a href="/collections/all">Shop our tested devices</a> with condition reports and warranty.</p>
    `,
  },
  {
    title: 'Accessories that actually protect your tech',
    handle: 'accessories-that-protect-your-tech',
    summary: 'The small purchases that prevent expensive repairs, from cases and glass to chargers and sleeves.',
    tags: ['Accessories', 'Tips', 'Protection'],
    publishDate: '2026-01-24T10:00:00Z',
    image: 6,
    imageAlt: 'Illustration of headphones, a smartwatch and charging accessories',
    body: `
      <p>A good case costs far less than a screen repair. These accessories protect your phone, laptop and audio gear where damage usually happens.</p>
      <h2>For your phone</h2>
      <h3>A fitted case</h3>
      <p>Choose a case with raised edges around the screen and camera. Thin cases look good but often do not survive a drop on a hard floor.</p>
      <h3>Tempered glass</h3>
      <p>A screen protector takes the impact instead of the display. Replace it when it cracks, and make sure it does not cover the front camera or sensors.</p>
      <h3>A reliable charger</h3>
      <p>Use a charger that supports your phone's fast-charging standard. Cheap unknown chargers can overheat and damage the battery.</p>
      <h2>For your laptop</h2>
      <h3>A padded sleeve</h3>
      <p>A sleeve protects against scratches and small impacts in a bag. Check that the size matches your laptop, including the charger pocket.</p>
      <h3>A keyboard cover or cleaning kit</h3>
      <p>Dust and crumbs are the enemy of laptop keyboards. A soft brush and microfiber cloth keep the keys and screen clean without harsh chemicals.</p>
      <h2>For your audio gear</h2>
      <h3>A hard case for headphones</h3>
      <p>Headphones are easy to crush in a backpack. A hard case protects the hinges and ear cups, especially for over-ear models.</p>
      <h3>Replacement ear tips</h3>
      <p>The right ear tips improve comfort and sound isolation. Replace worn tips instead of turning up the volume.</p>
      <h2>For everything</h2>
      <ul>
        <li>Keep cables organized with velcro straps to avoid bent connectors.</li>
        <li>Use a power strip with surge protection for your desk setup.</li>
        <li>Store devices in a dry place, away from direct sun and heat.</li>
      </ul>
      <blockquote>Buy protection before you need it. The best accessory is the one that keeps your device out of repair.</blockquote>
      <p>Find cases, chargers, sleeves and audio accessories in our <a href="/collections/all">accessories collection</a>.</p>
    `,
  },
];
