document.addEventListener('DOMContentLoaded', () => {
  const orderId = new URLSearchParams(location.search).get('order');
  if (!Auth.isLoggedIn() || !orderId) return location.href = '/orders.html';
  document.getElementById('dispatchForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { const data = Object.fromEntries(new FormData(event.target)); const files = [...document.getElementById('dispatchImages').files]; const dispatch_images = []; for (const file of files) dispatch_images.push(await Upload.file(file)); await API.post('/logistics/shipments', { order_id: orderId, tracking_number: data.tracking_number || null, pickup_location: data.pickup_location, description: data.description, dispatch_images, dispatch_method: 'manual', estimated_delivery_at: null, dispatch_details: { dispatch_date: data.dispatch_date, rider_phone: data.rider_phone, alternate_phone: data.alternate_phone || null, pickup_location: data.pickup_location, destination: data.destination } }); Toast.show('Dispatch submitted and the buyer has been notified.'); setTimeout(() => location.href = `/order.html?id=${orderId}`, 700); } catch (error) { Toast.show(error.message); button.disabled = false; }
  });
});
