// setup logger
var winston = require('winston'),
  fs = require('fs');

if(!fs.existsSync('/var/log'))
{
  fs.mkdirSync('/var/log');
}

function timestamp(){
  return new Date()
}

var logger = new winston.Logger({
  transports:  [
      new (winston.transports.Console)({ level: 'verbose', 'timestamp':true}),
      new (winston.transports.File)({ filename: '/var/log/fetcher', level: 'info', json: false })
    ],
  exitOnError: false
});

var Sequelize = require('sequelize')
  , sequelize = new Sequelize('SciPark', 'sci', '', {
      dialect: "mariadb", // or 'sqlite', 'postgres', 'mariadb'
      port:    3306, // or 5432 (for postgres)
      logging: false,
    })

sequelize
  .authenticate()
  .complete(function(err) {
    if (!!err) {
      logger.error('Unable to connect to the database:', err)
    } 
    else {
      logger.verbose('Connection has been established successfully.')
    }
  });

var BusLocation = sequelize.define('BusLocation', {
	LP: {type:Sequelize.STRING(10),primaryKey: true},
	DriverName: {type:Sequelize.STRING(5)},
	Speed: {type:Sequelize.DECIMAL(5, 2)},
	Updatetime: {type:Sequelize.DATE, primaryKey: true},
	OnOff: {type:Sequelize.ENUM('ON', 'OFF')},
	Lat: {type:Sequelize.DECIMAL(9, 6)},
	Lng: {type:Sequelize.DECIMAL(9, 6)},
	Azimuth: {type:Sequelize.INTEGER}
}, {
	timestamps: true
});

var http = require('http'),
    xml2js = require('xml2js');

var parser = new xml2js.Parser();

var options = {
  host: '117.56.78.38',
  path: '/sipa/busAzimuth.xml'
};

var previousData = {};

var callback = function(response) {
  logger.verbose('response received');
  var str = '';

  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {
    logger.verbose('http ended: datalength: ' + str.length);
    parser.parseString(str, function (err, result) {
      if(!!err){
        logger.error('error parsing xml', err);
        logger.error('with string', {string: str});
      }
      else{
        try{
          result.Buss.bus.map(function(e){return e.$;}).forEach(function(busData){
            
            if(previousData[busData.LP] && previousData[busData.LP].Updatetime == busData.Updatetime)
            {
              return;
            }

            previousData[busData.LP] = busData;

            logger.info("new data: %j", busData);

            var location = BusLocation.build(busData);
            location
              .save()
              .complete(function(err) {
                if (!!err) {
                  logger.error('The instance has not been saved:', err);
                  logger.error('data:', busData);
                } 
                else{
                  logger.verbose('saved %j', busData);
                }
              });
          });
        }
        catch(e){
          logger.error('error parsing xml', e);
        }
      }
    });
  });
};

var previousHour = -1;
var fetchBusLocation = function (){
  var hours = new Date().getHours();
  if (hours >= 6 && hours < 23) {
    if(hours != previousHour){
      previousHour = hours;
      http = require('http');
      logger.info('reinitiaize http lib at ' + hours);
    }

    http.request(options, callback)
      .on('error', function(e) {
        logger.error('problem with request: ' + e.message);
      })
      .end();
    logger.verbose('request initiated');
    setTimeout(fetchBusLocation, 5000);
  }
  else {
    setTimeout(fetchBusLocation, 60000);
  }
  
}


sequelize
  .sync({ force: false })
  .complete(function(err) {
     if (!!err) {
       logger.error('An error occurred while creating the table:', err)
     } else {
       logger.info('Start fetching data');
       fetchBusLocation();
     }
  })


// fs.readFile('/Users/klandor/Downloads/busAzimuth.xml', function(err, data) {

// });
