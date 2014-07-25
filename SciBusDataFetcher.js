// setup logger
var winston = require('winston'),
  fs = require('fs');

if(!fs.existsSync('log'))
{
  fs.mkdirSync('log');
}

var logger = new winston.Logger({
  transports:  [
      new (winston.transports.Console)({ level: 'verbose'}),
      new (winston.transports.File)({ filename: 'log/fetcher.log', level: 'info' })
    ],
  exitOnError: false
});

var Sequelize = require('sequelize')
  , sequelize = new Sequelize('SciPark', 'sci', '', {
      dialect: "mariadb", // or 'sqlite', 'postgres', 'mariadb'
      port:    3306, // or 5432 (for postgres)
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
  var str = '';

  //another chunk of data has been recieved, so append it to `str`
  response.on('data', function (chunk) {
    str += chunk;
  });

  //the whole response has been recieved, so we just print it out here
  response.on('end', function () {
    parser.parseString(str, function (err, result) {
      if(!!err){
        logger.error('error parsing xml', err);
        logger.error('with string', {string: str}});
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
                // else{
                //   logger.verbose('saved %j', busData);
                // }
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

var fetchBusLocation = function (){
  http.request(options, callback).end();
  setTimeout(fetchBusLocation, 5000);
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
