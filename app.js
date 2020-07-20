const express = require("express");
const app = express();

const Datastore = require("nedb-promises");
const db = {};
db.weather = Datastore.create("./weather.db");
db.images = Datastore.create("./images.db");

const axios = require("axios");
const dayjs = require("dayjs");
const fs = require("fs").promises;
const uuid = require("uuid");
const path = require("path");
const jimp = require('jimp');

const RAKUTEN_API_KEY = "<API Key>";
const OPEN_WEATHER_MAP_API_KEY = "<API Key>";
const SITE_ROOT = process.env.PORT ? "https://fleuve-mode.herokuapp.com/" : "http://localhost:8000/"

const prefTnqlList = {
	"北海道": "HKD",
	"青森県": "AOM",
	"岩手県": "IWT",
	"宮城県": "MYG",
	"秋田県": "AKT",
	"山形県": "YGT",
	"福島県": "FKS",
	"茨城県": "IBR",
	"栃木県": "TCG",
	"群馬県": "GNM",
	"埼玉県": "SIT",
	"千葉県": "CHB",
	"東京都": "TKY",
	"神奈川県": "KNG",
	"新潟県": "NGT",
	"富山県": "TYM",
	"石川県": "ISK",
	"福井県": "FKI",
	"山梨県": "YMN",
	"長野県": "NGN",
	"岐阜県": "GIF",
	"静岡県": "SZO",
	"愛知県": "AIC",
	"三重県": "MIE",
	"滋賀県": "SIG",
	"京都府": "KYT",
	"大阪府": "OSK",
	"兵庫県": "HYG",
	"奈良県": "NAR",
	"和歌山県": "WKY",
	"鳥取県": "TTR",
	"島根県": "SMN",
	"岡山県": "OKY",
	"広島県": "HRS",
	"山口県": "YGC",
	"徳島県": "TKS",
	"香川県": "KGW",
	"愛媛県": "EHM",
	"高知県": "KUC",
	"福岡県": "FKO",
	"佐賀県": "SAG",
	"長崎県": "NGS",
	"熊本県": "KMM",
	"大分県": "OIT",
	"宮崎県": "MYZ",
	"鹿児島県": "KGS",
	"沖縄県": "OKN",
}

const prefDrk7List = {
	"北海道": "01",
	"青森県": "02",
	"岩手県": "03",
	"宮城県": "04",
	"秋田県": "05",
	"山形県": "06",
	"福島県": "07",
	"茨城県": "08",
	"栃木県": "09",
	"群馬県": "10",
	"埼玉県": "11",
	"千葉県": "12",
	"東京都": "13",
	"神奈川県": "14",
	"新潟県": "15",
	"富山県": "16",
	"石川県": "17",
	"福井県": "18",
	"山梨県": "19",
	"長野県": "20",
	"岐阜県": "21",
	"静岡県": "22",
	"愛知県": "23",
	"三重県": "24",
	"滋賀県": "25",
	"京都府": "26",
	"大阪府": "27",
	"兵庫県": "28",
	"奈良県": "29",
	"和歌山県": "30",
	"鳥取県": "31",
	"島根県": "32",
	"岡山県": "33",
	"広島県": "34",
	"山口県": "35",
	"徳島県": "36",
	"香川県": "37",
	"愛媛県": "38",
	"高知県": "39",
	"福岡県": "40",
	"佐賀県": "41",
	"長崎県": "42",
	"熊本県": "43",
	"大分県": "44",
	"宮崎県": "45",
	"鹿児島県": "46",
	"沖縄県": "47",
}


const cropImage = async (src, dest) => {
	const image = await jimp.read(src)
		if (image.getPixelColor(0, 0) != 0xFFFFFF00){
			image.autocrop()
				.background(0xFFFFFF00)
				.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx){
					if (this.bitmap.data[idx + 0] >= 253 && this.bitmap.data[idx + 1] >= 253 && this.bitmap.data[idx + 2] >= 253 && this.bitmap.data[idx + 3] == 255){
						image.setPixelColor(0xFFFFFF00, x, y);
					}
				})
				.write(dest)
		} else {
			image.background(0xFFFFFF00)
				.autocrop()
				.write(dest)
		}
}

app.use("/", express.static("client"));
app.use("/img", express.static("img"));

app.get("/api/tnql", (req, res) => {
	// CORS
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

	const pref = req.query.pref;
	if (prefTnqlList[pref]) {
		const prefCode = prefTnqlList[pref];
		db.weather.findOne({"pref_code": prefCode, "updated_at": {"$gte": dayjs().subtract(1, "hour")}})
			.then((cursor) => {
				if (cursor){
					res.json(cursor.data);
				} else {
					axios.get("https://tnql-coords-trial-v2.p.rapidapi.com/v2/api/coords_trial", {
						headers:{
							"content-type": "application/octet-stream",
							"x-rapidapi-host": "tnql-coords-trial-v2.p.rapidapi.com",
							"x-rapidapi-key": RAKUTEN_API_KEY,
							"useQueryString": true
						},
						params:{
							"airport": prefCode
						}
					})
						.then(async (response) => {
							let getImagePromises = [];
							let data = response.data.results["a"];
							for (let i = 0; i < data.length; i++){
								const originalUrl = data[i].image
								const cursor = await db.images.findOne({originalUrl: originalUrl})
								if (cursor){
									data[i].image = SITE_ROOT + "img/croped/" + cursor.filename;
									data[i].imageId = cursor.filename;
								} else {
									const imageId = uuid.v4();
									const imageOriginalExtname = path.extname(originalUrl);
									const filename = imageId + ".png";
									data[i].image = SITE_ROOT + "img/croped/" + filename;
									data[i].imageId = imageId;
									data[i].imageOriginalExtname = imageOriginalExtname;
									db.images.insert({
										"filename": filename,
										"originalUrl": originalUrl,
									})
									getImagePromises.push(new Promise((resolve, reject) => {
										axios.get(originalUrl, {responseType: "arraybuffer"})
											.then((response) => {
												fs.writeFile("./img/original/" + imageId + imageOriginalExtname, new Buffer.from(response.data, "binary"))
													.then(() => {
														cropImage("./img/original/" + imageId + imageOriginalExtname, "./img/croped/" + filename)
															.then(() => {
																resolve()
															})
													})
											});
									}));
								}

							}
							Promise.all(getImagePromises)
								.then(() => {
									const result = {
										"pref_code": response.data.param.airport,
										"updated_at": new Date(),
										"data": data
									};
									db.weather.update({"pref_code": response.data.param.airport}, result, {"upsert": true});
									res.json(data);
								})
						})
						.catch((error)=>{
							console.log(error)
						})
				}
			})
	}
})

app.get("/api/drk7", (req, res) => {
	// CORS
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

	const pref = req.query.pref;
	if (prefDrk7List[pref]) {
		const pref_no = prefDrk7List[pref];
		axios.get(`https://www.drk7.jp/weather/json/${prefDrk7List[pref]}.js`)
			.then((response) => {
				const match = response.data.match(/drk7jpweather.callback\((.*)\)/)
				const data = JSON.parse(match[1]);
				res.json(data);
			})
	}
})

app.get("/api/owm", (req, res) => {
	// CORS
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

	let query = req.query;
	console.log(query)
	query.appid = OPEN_WEATHER_MAP_API_KEY

	axios.get(`https://api.openweathermap.org/data/2.5/onecall`, {
		params: query
	})
		.then((response) => {
			res.json(response.data);
		})
})

app.listen(process.env.PORT ? process.env.PORT : 8000, () => console.log(`App is listening on port ${process.env.PORT ? process.env.PORT : 8000}!`))