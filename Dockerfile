# Mosque Carpool — Railway deploy (PHP 8.2 + Apache + MySQL driver)
FROM php:8.2-apache

# MySQL driver (mysqlnd handles Railway MySQL 8 auth)
RUN docker-php-ext-install pdo pdo_mysql

COPY . /var/www/html/

# Railway assigns $PORT at container start — point Apache at it.
CMD sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf && \
    sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf && \
    apache2-foreground
