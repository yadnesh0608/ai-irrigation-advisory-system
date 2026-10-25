const token = localStorage.getItem('token');
if (!token) window.location = 'login.html';

document.getElementById('farmerName').innerText = localStorage.getItem('farmerName');

async function loadDashboard() {
  const res = await fetch('http://localhost:5000/api/dashboard', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  // Plots
  let plotsHtml = '';
  data.plots.forEach(p => {
    plotsHtml += `<div class="border p-2 mb-2 rounded">${p.plot_name} (${p.area_acres} acres) - ${p.soil_type}</div>`;
  });
  document.getElementById('plotsList').innerHTML = plotsHtml || '<p>No plots yet</p>';

  // Dropdown for sensor
  let options = '<option value="">Select Plot</option>';
  data.plots.forEach(p => {
    options += `<option value="${p.id}">${p.plot_name}</option>`;
  });
  document.getElementById('plotSelect').innerHTML = options;

  // Recommendations
  let recsHtml = '';
  data.recommendations.forEach(r => {
    recsHtml += `
      <div class="recommendation">
        <strong>${r.plot_name}</strong><br>
        ${r.recommendation}<br>
        <small>Next date: ${r.next_irrigation_date?.substring(0,10)} | Duration: ${r.duration_hours} hrs</small>
      </div>`;
  });
  document.getElementById('recsList').innerHTML = recsHtml || '<p>No recommendations yet. Add a sensor reading!</p>';
}

async function addPlot() {
  const data = {
    plot_name: document.getElementById('plotName').value,
    area_acres: document.getElementById('area').value,
    soil_type: document.getElementById('soilType').value
  };
  await fetch('http://localhost:5000/api/plots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  loadDashboard();
  alert('Plot added!');
}

async function addSensor() {
  const data = {
    plot_id: document.getElementById('plotSelect').value,
    soil_moisture: document.getElementById('moisture').value,
    temperature: document.getElementById('temp').value
  };
  const res = await fetch('http://localhost:5000/api/sensor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  alert(result.recommendation.recommendation);
  loadDashboard();
}

function logout() {
  localStorage.clear();
  window.location = 'login.html';
}

loadDashboard();