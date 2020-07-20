const SERVER_ROOT = "/"

dayjs.locale("ja");

const getOpenWeatherMap = async (lat, lon) => {
	const params_openweathermap = {
		lat: lat,
		lon: lon,
		units: "metric",
		lang: "ja",
	};
	const response = await fetch(`${SERVER_ROOT}api/owm?${new URLSearchParams(params_openweathermap)}`)
	return await response.json()
}

const getPref = async (lat, lon) => {
	const params_geo = {
		method: "searchByGeoLocation",
		y: lat,
		x: lon,
	};
	const response = await fetch(`https://geoapi.heartrails.com/api/json?${new URLSearchParams(params_geo)}`)
	const result = await response.json();
	return result.response.location[0].prefecture;
}

const getTnql = async (pref) => {
	// 気象ファッションAPI
	const params = {
		pref: pref,
	};
	const response = await fetch(`${SERVER_ROOT}api/tnql?${new URLSearchParams(params)}`)
	return await response.json();
}

const getDrk7 = async (pref, lat, lon) => {
	const params = {
		pref: pref,
	};
	const response = await fetch(`${SERVER_ROOT}api/drk7?${new URLSearchParams(params)}`)
		.catch((err) => {
			throw new Error(err);
		})
	const result = await response.json()
		.catch((err) => {
			throw new Error(err);
		})
	let nearestDistance = null;
	let nearestArea;
	if (["大阪府", "香川県"].includes(pref)) {
		nearestArea = JSON.parse(JSON.stringify(result.pref.area))
		nearestArea.pref = pref
		nearestArea.area = nearestArea.id
	} else {
		for (const [name, area] of Object.entries(result.pref.area)){
			const distance = geolib.getDistance(
				{ latitude: lat, longitude: lon },
				{ latitude: area.geo.lat, longitude: area.geo.long }
			)
			if (nearestDistance === null || nearestDistance > distance){
				nearestDistance = distance;
				nearestArea = JSON.parse(JSON.stringify(area));
				nearestArea.pref = pref
				nearestArea.area = name
			}
		}
	}
	console.log(nearestArea)
	console.log("TEST")
	let maxRainFallChance
	for (const day of nearestArea.info){
		// 天気画像の処理
		const match = day.img.match(/www.drk7.jp\/MT\/images\/MTWeather\/([0-9]{3})\.gif/)
		day.id = `${match[1]}`

		// 降水確率の処理
		for (const periodRainFallChance of day.rainfallchance.period){
			periodRainFallChance.content = parseInt(periodRainFallChance.content)
			if (!maxRainFallChance || maxRainFallChance < periodRainFallChance.content){
				maxRainFallChance = periodRainFallChance.content
			}
		}
		day.rainfallchance.max = maxRainFallChance;
	}
	return nearestArea
}

const parseWeatherData = (results) => {

	const openWeatherMapData = {
		today: results[0].value.daily[0],
		daily: results[0].value.daily,
		hourly: results[0].value.hourly,
	}
	const drk7Data = {
		pref: results[1].value.pref,
		area: results[1].value.area,
		today: results[1].value.info[0],
		daily: results[1].value.info,
	}
	const tnqlData = {
		today: results[2].value,
	}
	let weatherData = {
		today: {},
		hourly: [],
		weekly: []
	}

	console.log(results[1].value)
	console.log(drk7Data.today)
	// todayデータ
	const fashions = []
	for (const fashionResults of tnqlData.today) {
		fashions.push({
			img: fashionResults.image,
			comment: fashionResults.description3,
		})
	}
	weatherData.today = {
		weather: {
			icon: openWeatherMapWeatherList[openWeatherMapData.today.weather[0].icon].icon,
			description: openWeatherMapData.today.weather[0].description,
		},
		comment: tnqlData.today[0].description2,
		temperature: {
			max: openWeatherMapData.today.temp.max,
			min: openWeatherMapData.today.temp.min,
		},
		fashions: fashions,
	}
	console.log(drk7Data)
	console.log(drk7Data.today.id + ": " + drk7Data.today.weather)
	if (drk7Data) {
		if (!drk7WeatherList[drk7Data.today.id]) {
			for (const [id, data] of Object.entries(drk7WeatherList)) {
				if (drk7Data.today.weather === data.description){
					drk7Data.today.id = id
					break
				}
			}
		}
		weatherData.today = Object.assign(weatherData.today,{
			weather: {
				icon: drk7WeatherList[drk7Data.today.id].icon,
				description: drk7Data.today.weather,
			},
			comment: `今日の天気は${drk7Data.today.weather}<br>${tnqlData.today[0].description2}`,
			temperature: {
				max: Number(drk7Data.today.temperature.range[0].content),
				min: Number(drk7Data.today.temperature.range[1].content),
			},
			rainFallChance: drk7Data.today.rainfallchance.max,
			needUmbrella: drk7WeatherList[drk7Data.today.id].needUmbrella,
		})
	}
	// hourlyデータ
	for (let i = 0; i < openWeatherMapData.hourly.length; i++) {
		const hourOWM = openWeatherMapData.hourly[i]
		const hour = {
			time: dayjs.unix(hourOWM.dt),
			weather: {
				icon: openWeatherMapWeatherList[hourOWM.weather[0].icon].icon,
				description: hourOWM.weather[0].description,
			},
			temperature: hourOWM.temp,
			humidity: hourOWM.humidity,
			pressure: hourOWM.pressure,
		}
		if(drk7Data){
			const rainFallSource = drk7Data.daily[hour.time.diff(dayjs().startOf("day"), "day")].rainfallchance.period[Math.floor(hour.time.hour() / 6)]
			hour.rainFallChance = {
				value: rainFallSource.content,
				hour: rainFallSource.hour,
				isFirst: i === 0 || hour.time.hour() % 6 === 0,
				rangeAfter: 6 - hour.time.hour() % 6,
			}
		}
		weatherData.hourly.push(hour)
	}
	// weeklyデータ
	for (let i = 0; i < 7; i++) {
		const dayOWM = openWeatherMapData.daily[i];
		let day = {
			time: dayjs.unix(dayOWM.dt),
			weather: {
				icon: openWeatherMapWeatherList[dayOWM.weather[0].icon].icon,
				description: dayOWM.weather[0].description,
			},
			uvIndex: dayOWM.uvi,
			temperature: {
				max: dayOWM.temp.max,
				min: dayOWM.temp.min,
			},
			humidity: dayOWM.humidity,
			pressure: dayOWM.pressure,
		}
		if(drk7Data){
			const dayDrk7 = drk7Data.daily[i];
			day = Object.assign(day,{
				weather: {
					icon: drk7WeatherList[dayDrk7.id].icon,
					description: dayDrk7.weather
				},
				weatherText: dayDrk7.weather,
				temperature: {
					max: Number(dayDrk7.temperature.range[0].content),
					min: Number(dayDrk7.temperature.range[1].content),
				},
				rainFallChance: dayDrk7.rainfallchance.max,
			})
		}
		weatherData.weekly.push(day)
	}
	if (drk7Data) {
		weatherData.pref = drk7Data.pref
		weatherData.area = drk7Data.area
	}

	return weatherData

}

const getWeatherData = async (lat, lon) => {
	let getPromiseList = []
	getPromiseList.push(getOpenWeatherMap(lat, lon))
	const pref = await getPref(lat, lon)
	getPromiseList.push(getDrk7(pref, lat, lon))
	getPromiseList.push(getTnql(pref))
	const results = await Promise.allSettled(getPromiseList)
	return parseWeatherData(results);
}

const setRainFallChance = (value) => {
	const wave1Element = document.querySelector("#first-page #weather-wave1")
	const wave2Element = document.querySelector("#first-page #weather-wave2")
	wave1Element.style.top = `${60 - value}%`
	wave2Element.style.top = `${60 - value}%`
}

const parseUvIndex = (uvi) => {
	let result = {}
	if (uvi < 3) {
		result = {
			img: "img/uv-low.svg",
			comment: "紫外線が弱めです"
		}
	} else if (3 <= uvi && uvi < 5) {
		result = {
			img: "img/uv-normal.svg",
			comment: "紫外線は普通です"
		}
	} else if (5 <= uvi && uvi < 8) {
		result = {
			img: "img/uv-strong.svg",
			comment: "紫外線が強いです"
		}
	} else {
		result = {
			img: "img/uv-very-strong.svg",
			comment: "紫外線がかなり強いです"
		}
	}
	return result
}

const setNeedUmbrella = (needUmbrella) => {
	const umbrellaImgElement = document.querySelector("#detail-page #info #umbrella p.image");
	const umbrellaTextElement = document.querySelector("#detail-page #info #umbrella p.text");
	if (needUmbrella == 0) {
		umbrellaImgElement.style.backgroundImage = "url(img/umbrella-none.png)"
		umbrellaTextElement.textContent = "傘はなくても大丈夫"
	} else if (needUmbrella == 1) {
		umbrellaImgElement.style.backgroundImage = "url(img/umbrella-folding.png)"
		umbrellaTextElement.textContent = "折りたたみ傘を持って"
	} else {
		umbrellaImgElement.style.backgroundImage = "url(img/umbrella-long.png)"
		umbrellaTextElement.textContent = "長い傘を持って"
	}
}

const showWeatherData = async (weatherData) => {
	const iconImgElement = document.querySelector("#first-page #weather-icon #img img");
	const highestTempElement = document.querySelector("#first-page .highest-temp");
	const lowestTempElement = document.querySelector("#first-page .lowest-temp");
	if (weatherData.area){
		const areaNameElement = document.querySelector("#first-page h1 #area-name")
		areaNameElement.textContent = ["東京都", "大阪府", "香川県"].includes(weatherData.pref) ? weatherData.area : weatherData.pref + weatherData.area
	}
	iconImgElement.src = `img/weather-icons/${weatherData.today.weather.icon}.svg`;
	iconImgElement.alt = weatherData.today.weather.description;
	highestTempElement.textContent = Math.round(weatherData.today.temperature.max) + "℃";
	lowestTempElement.textContent = Math.round(weatherData.today.temperature.min) + "℃";
	setRainFallChance(weatherData.today.rainFallChance)
	setNeedUmbrella(weatherData.today.needUmbrella)

	const commentElement = document.querySelector("#detail-page #comment");
	const fashionImgElement = document.querySelector("#detail-page #fashion p.image");
	const fashionTextElement = document.querySelector("#detail-page #fashion p.text");
	const uvImgElement = document.querySelector("#detail-page #info #uv p.image");
	const uvTextElement = document.querySelector("#detail-page #info #uv p.text");
	commentElement.innerHTML = weatherData.today.comment;
	fashionImgElement.style.backgroundImage = `url(${weatherData.today.fashions[1].img})`;
	fashionTextElement.textContent = weatherData.today.fashions[1].comment;

	const uvData = parseUvIndex(weatherData.today.uvIndex)
	uvImgElement.style.backgroundImage = `url(${uvData.img})`
	uvTextElement.textContent = uvData.comment

	const hourlyTableElement = document.querySelector("#hourly-page table")
	hourlyTableElement.innerHTML = '<tr class="table-header"><th>時刻</th><th>天気</th><th>気温</th><th>降水<br>確率</th></tr>'
	for (const hour of weatherData.hourly.slice(0, 12)) {
		const trElement = hourlyTableElement.insertRow(-1);
		trElement.innerHTML = `<th>${hour.time.hour()}時</th><td><img src=\"img/weather-icons/${hour.weather.icon}.svg\" alt=\"${hour.weather.description}\"></td><td>${Math.round(hour.temperature)}℃</td><td>${hour.rainFallChance.value}%</td>`
	}

	const weeklyTableElement = document.querySelector("#weekly-page table")
	weeklyTableElement.innerHTML = '<tr class="table-header"><th>日</th><th>天気</th><th>気温</th><th>降水<br>確率</th></tr>'
	for (const day of weatherData.weekly) {
		const trElement = weeklyTableElement.insertRow(-1);
		trElement.innerHTML = `<th>${day.time.format("D(dd)")}</th><td><img src="img/weather-icons/${day.weather.icon}.svg" alt="${day.weather.description}"></td><td><span class="highest-temp">${Math.round(day.temperature.max)}℃</span><span class="lowest-temp">${Math.round(day.temperature.min)}℃</span></td><td>${day.rainFallChance}%</td>`
	}
	return 0
}


const prepareUI = async () => {
	const sections = document.querySelectorAll("main section");
	const observerRoot = document.querySelector("main");
	const topInfoElement = document.getElementById("first-page");
	const options = {
		root: observerRoot,
		rootMargin: "-50% 0px",
		threshold: 0
	};
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				if (entry.target !== topInfoElement){
					topInfoElement.classList.add("scrolled");
				} else {
					topInfoElement.classList.remove("scrolled");
				}
			}
		});
	}, options);
	sections.forEach(section => {
		observer.observe(section);
	});

	// ハンバーガーメニュー
	const hamburgerElement = document.getElementById("hamburger")
	const overlayElement = document.getElementById("overlay")
	const bodyElement = document.getElementsByTagName("body")[0]
	hamburgerElement.addEventListener("click", () => {
		bodyElement.classList.toggle("drawer-opened")
	})
	overlayElement.addEventListener("click", () => {
		bodyElement.classList.remove("drawer-opened")
	})

	// メニューアイテム
	const menuItemElements = document.querySelectorAll("header nav ul li a")
	for (const menuItemElement of menuItemElements) {
		menuItemElement.addEventListener("click", (event) => {
			const bodyElement = document.getElementsByTagName("body")[0]
			bodyElement.classList.remove("drawer-opened")
			const target = event.target.dataset.target
			const targetElement = document.getElementById(target)
			targetElement.classList.add("show")
		})
	}
	const optionsPageElements = document.querySelectorAll("#options > div")
	for (const optionsPageElement of optionsPageElements) {
		const closeElement = optionsPageElement.getElementsByClassName("close")[0]
		closeElement.addEventListener("click", () => {
			optionsPageElement.classList.remove("show")
		})
		const overlayElement = optionsPageElement.getElementsByClassName("overlay")[0]
		overlayElement.addEventListener("click", () => {
			optionsPageElement.classList.remove("show")
		})
	}

	const submitAreaElement = document.getElementById("submit-area")
	const isUsingGPSElement = document.getElementById("is-using-gps")
	const prefSelectBoxElement = document.querySelector("#area-config select#pref")
	const areaSelectBoxElement = document.querySelector("#area-config select#area")
	if (!Cookies.get('lat') && !Cookies.get('lon')){
		isUsingGPSElement.checked = true;
		prefSelectBoxElement.disabled = true
		areaSelectBoxElement.disabled = true
		submitAreaElement.disabled = false;
	}
	isUsingGPSElement.addEventListener("change", (event) => {
		if (event.target.checked) {
			prefSelectBoxElement.disabled = true
			areaSelectBoxElement.disabled = true
			submitAreaElement.disabled = false;
			prefSelectBoxElement.selectedIndex = 0
			areaSelectBoxElement.selectedIndex = 0
			Cookies.remove("lat")
			Cookies.remove("lon")
			showWeatherWithGPS()
		} else {
			prefSelectBoxElement.disabled = false
			areaSelectBoxElement.disabled = false
			submitAreaElement.disabled = true;
		}
	})

	for (const [pref, area] of Object.entries(areaList)) {
		const prefOptionElement = document.createElement("option")
		prefOptionElement.textContent = pref
		prefOptionElement.value = pref
		prefSelectBoxElement.appendChild(prefOptionElement)
	}
	prefSelectBoxElement.addEventListener("change", (event) => {
		const prefName = event.target.value
		areaSelectBoxElement.innerHTML = "<option disabled selected value='0'>地域</option>"
		for (const [areaName, areaData] of Object.entries(areaList[prefName])) {
			const areaOptionElement = document.createElement("option")
			areaOptionElement.textContent = areaName
			areaOptionElement.value = areaName
			areaOptionElement.dataset.lat = areaData.lat
			areaOptionElement.dataset.lon = areaData.lon
			areaSelectBoxElement.appendChild(areaOptionElement)
		}
	})
	areaSelectBoxElement.addEventListener("change", (event) => {
		const selectedIndex = event.target.selectedIndex
		const optionElements = event.target.getElementsByTagName("option")
		console.log(selectedIndex)
		const selectedOptionElement = optionElements[selectedIndex]
		console.log(selectedOptionElement)
		const lat = Number(selectedOptionElement.dataset.lat)
		const lon = Number(selectedOptionElement.dataset.lon)
		Cookies.set("lat", lat)
		Cookies.set("lon", lon)
		showWeather(lat, lon)
		submitAreaElement.disabled = false;
	})
}

const showWeather = (lat, lon) => {
	const firstPageElement = document.getElementById("first-page")
	firstPageElement.scrollIntoView()
	getWeatherData(lat, lon)
		.then((weatherData) => {
			showWeatherData(weatherData)
				.then(() => {
					const loadingElement = document.getElementById("loading")
					loadingElement.classList.add("loaded");
				})
		})
}

const showWeatherWithGPS = () => {
	navigator.geolocation.getCurrentPosition((location) => {
		const lat = location.coords.latitude
		const lon = location.coords.longitude
		showWeather(lat, lon)
	}, () => {
		const submitAreaElement = document.getElementById("submit-area")
		const isUsingGPSWrapElement = document.getElementById("is-using-gps-wrap")
		const isUsingGPSElement = document.getElementById("is-using-gps")
		const prefSelectBoxElement = document.querySelector("#area-config select#pref")
		const areaSelectBoxElement = document.querySelector("#area-config select#area")
		isUsingGPSWrapElement.style.display = "none"
		isUsingGPSElement.checked = false
		prefSelectBoxElement.disabled = false
		areaSelectBoxElement.disabled = false
		submitAreaElement.disabled = true
		const areaConfigElement = document.getElementById("area-config")
		areaConfigElement.classList.add("show")
	})
}

window.onload = () => {
	prepareUI()

	const lat = Cookies.get('lat')
	const lon = Cookies.get('lon')

	if (lat && lon){
		showWeather(lat, lon)
	} else {
		showWeatherWithGPS()
	}
}
