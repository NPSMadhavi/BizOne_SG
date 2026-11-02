try {
  const res = await fetch('http://localhost:8080/api/warehouses');
  console.log('API port 8080 status:', res.status);
  const data = await res.json();
  console.log('Data:', data);
} catch (e) {
  console.error('Fetch error:', e.message);
}
