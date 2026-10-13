# Mosque Carpool — Railway deploy (PHP 8.2 + Apache + MySQL driver)
FROM php:8.2-apache

# Apache must run exactly ONE MPM (prefork, required by mod_php).
# Remove any other MPM symlinks directly (no silent failures),
# then print what's enabled so the build log proves it.
RUN rm -f /etc/apache2/mods-enabled/mpm_event.load \
          /etc/apache2/mods-enabled/mpm_event.conf \
          /etc/apache2/mods-enabled/mpm_worker.load \
          /etc/apache2/mods-enabled/mpm_worker.conf; \
    a2enmod mpm_prefork; \
    echo "=== MPMs enabled at BUILD time ==="; \
    ls /etc/apache2/mods-enabled/ | grep -i mpm; \
    docker-php-ext-install pdo pdo_mysql

COPY . /var/www/html/

# Railway assigns $PORT at container start — point Apache at it.
# Also print enabled MPMs at RUNTIME, right before Apache starts,
# so the deploy log shows exactly what Apache sees.
CMD echo "=== MPMs enabled at RUNTIME ==="; \
    ls /etc/apache2/mods-enabled/ | grep -i mpm; \
    sed -i "s/Listen 80/Listen $PORT/" /etc/apache2/ports.conf && \
    sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/" /etc/apache2/sites-available/000-default.conf && \
    apache2-foreground
